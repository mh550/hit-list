import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { deleteMember, getMembers, upsertMembers } from '@/src/db/hit-lists';
import { upsertProfiles } from '@/src/db/profiles';
import { useInboxStore, type InviteItem } from '@/src/stores/inbox-store';
import type { FriendProfile, HitListKind, MemberRole } from '@/src/types';
import { maySync } from './account';
import { errorMessage, serverError, type ServerError } from './errors';
import { deleteCachedPhotos } from './photos';
import { applyListRow, memberFromServer } from './pull';
import { runExclusive } from './queue';
import { reloadStoresQuietly } from './reload';
import { forgetList, removeMemberLocally, removeUnheldForeignSpots, unshareLocally } from './shared-rows';
import { createTickets } from './tickets';
import { toIso } from './time';

/*
 * Shared hit lists (S8, docs/plans/2026-10-22-s8-shared-lists.md "Data"): the server's functions and RLS decide
 * everything (share_list, the hit_list_members policies, remove_member, leave_list, stop_sharing,
 * list_invitations). Every call takes the client and the rider and does nothing (resolves false) unless the client
 * holds a session for that rider and the phone's rows are theirs (maySync), so one process can run several riders
 * (the integration test). The local writes after a call are only what the server answered (the list row with its
 * rev, the member rows), so nothing echoes into the outbox; multi-row removals run on the sync queue in one
 * transaction, and the cached photos go after the commit.
 */

/** The server refused (42501): the rider is no longer allowed this in the list (removed, unshared, not the owner). */
export class NotAllowedError extends Error {
  constructor(message = "You can't do that in this list any more.") {
    super(message);
    this.name = 'NotAllowedError';
  }
}

/** D85: a list shares only once it is the rider's and backed up (no change of it waiting in the outbox). */
export class ListNotBackedUpError extends Error {
  constructor() {
    super("This list isn't backed up yet.");
    this.name = 'ListNotBackedUpError';
  }
}

/** What Join reads when the owner withdrew the invitation (or the server no longer lets the rider join). */
export const INVITATION_WITHDRAWN = 'This invitation was withdrawn.';

const fail = (error: ServerError): Error => (error.code === '42501' ? new NotAllowedError() : serverError(error));

type Row = Record<string, unknown>;

/**
 * Runs `write` on the sync queue in one transaction (no pull sees it half done), then deletes the cached photos. The
 * server has already answered, so a local failure only warns: the transaction leaves every row, and the next pull's
 * reconciliation removes them (a retry would get 42501 and read as a refusal; S8-09 review A#5).
 */
async function removeLocally(db: SQLiteDatabase, uid: string, write: () => Promise<void>): Promise<void> {
  let removed: string[] = [];
  try {
    await runExclusive(() =>
      db.withTransactionAsync(async () => {
        await write();
        removed = await removeUnheldForeignSpots(db, uid);
      }),
    );
  } catch (err) {
    removed = [];
    console.warn('[lists] the local removal failed; the next sync removes the rows:', errorMessage(err));
  }
  deleteCachedPhotos(removed);
  await reloadStoresQuietly(db);
}

/**
 * Shares the rider's list with friends, all with one role (D88): turns sharing on (share_list, only when it isn't
 * yet), writes the returned row at once (a failed invite then retries through `invite`), then invites. Throws
 * ListNotBackedUpError before any call for a list that isn't the rider's or still waits in the outbox (D85).
 */
export async function shareList(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
  listId: string,
  friendIds: string[],
  role: MemberRole,
): Promise<boolean> {
  if (!(await maySync(db, client, uid))) return false;
  const list = await db.getFirstAsync<{ shared: number; waiting: number }>(
    `SELECT shared, EXISTS (SELECT 1 FROM sync_outbox WHERE entity = 'hit_list' AND entity_id = l.id) AS waiting
     FROM hit_lists l WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
    listId,
    uid,
  );
  if (!list || list.waiting === 1) throw new ListNotBackedUpError();
  if (list.shared !== 1) {
    const { data, error } = await client.rpc('share_list', { p_list: listId });
    if (error) throw fail(error);
    await applyListRow(db, data as Row);
    await reloadStoresQuietly(db);
  }
  return invite(db, client, uid, listId, friendIds, role);
}

/**
 * Invites friends to a list the rider shares. An already invited friend is no error (a stale mirror), but a blocked
 * one fails the batch (the server's block guard): "Couldn't share", not the not-allowed copy.
 */
export async function invite(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
  listId: string,
  friendIds: string[],
  role: MemberRole,
): Promise<boolean> {
  if (!(await maySync(db, client, uid))) return false;
  const rows = [...new Set(friendIds)].map((id) => ({
    list_id: listId,
    user_id: id,
    role,
    status: 'invited' as const,
    invited_by: uid,
  }));
  if (rows.length === 0) return true;
  const { error } = await client
    .from('hit_list_members')
    .upsert(rows, { onConflict: 'list_id,user_id', ignoreDuplicates: true });
  if (error) throw serverError(error);
  // ignoreDuplicates left a known row as it was on the server: so does the mirror (the next pull corrects any other)
  const known = new Set((await getMembers(db, listId)).map((m) => m.user_id));
  await upsertMembers(
    db,
    rows.filter((r) => !known.has(r.user_id)).map(({ list_id, user_id }) => ({ list_id, user_id, role, status: 'invited' })),
  );
  await reloadStoresQuietly(db);
  return true;
}

/** The owner changes a member's role; a row the server no longer lets them change (0 rows) is NotAllowedError. */
export async function setRole(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
  listId: string,
  userId: string,
  role: MemberRole,
): Promise<boolean> {
  if (!(await maySync(db, client, uid))) return false;
  const { data, error } = await client
    .from('hit_list_members')
    .update({ role })
    .eq('list_id', listId)
    .eq('user_id', userId)
    .select('*');
  if (error) throw fail(error);
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) throw new NotAllowedError();
  await upsertMembers(db, rows.map(memberFromServer));
  await reloadStoresQuietly(db);
  return true;
}

/** The owner removes a member or withdraws an invitation; their spots leave the list with them (D43). */
export async function removeMember(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
  listId: string,
  userId: string,
): Promise<boolean> {
  if (!(await maySync(db, client, uid))) return false;
  const { error } = await client.rpc('remove_member', { p_list: listId, p_user: userId });
  if (error) throw fail(error);
  await removeLocally(db, uid, () => removeMemberLocally(db, listId, userId));
  return true;
}

/**
 * The rider leaves someone else's list: the server takes their spots out of it (D43); the phone drops the list, its
 * memberships and mirror rows, and the others' spots no other held list shows, with their cached photos.
 */
export async function leave(db: SQLiteDatabase, client: SupabaseClient, uid: string, listId: string): Promise<boolean> {
  if (!(await maySync(db, client, uid))) return false;
  const { error } = await client.rpc('leave_list', { p_list: listId });
  if (error) throw fail(error);
  await removeLocally(db, uid, async () => {
    await forgetList(db, listId);
  });
  return true;
}

/**
 * The owner stops sharing: the server drops every member, invitation and spot row not the owner's (t30_unshare); the
 * phone writes the re-read list row (shared off, server rev), drops the mirror rows and the members' spots.
 */
export async function stopSharing(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
  listId: string,
): Promise<boolean> {
  if (!(await maySync(db, client, uid))) return false;
  const { error } = await client.rpc('stop_sharing', { p_list: listId });
  if (error) throw fail(error);
  const { data, error: readError } = await client.from('hit_lists').select('*').eq('id', listId);
  if (readError) console.warn('[lists] re-reading the list after stop sharing failed:', readError.message);
  const row = ((data ?? []) as Row[])[0];
  await removeLocally(db, uid, async () => {
    // a failed re-read leaves `shared` to the next pull (its rev is newer)
    if (row) await applyListRow(db, row);
    await unshareLocally(db, uid, listId);
  });
  return true;
}

/**
 * Join or Decline an invitation (the rider's own member row). Join makes it 'member' (the caller then syncs: the pull's
 * fill brings the list and its spots); an invitation withdrawn meanwhile answers 0 rows: NotAllowedError. Either
 * answer, and a withdrawn invitation, takes the item off the Inbox.
 */
export async function respondInvite(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
  listId: string,
  answer: 'join' | 'decline',
): Promise<boolean> {
  if (!(await maySync(db, client, uid))) return false;
  // an invitations load already running would put the item back
  loads.take(uid);
  const removeItem = () => useInboxStore.getState().removeItem(uid, 'invite', listId);
  if (answer === 'join') {
    const { data, error } = await client
      .from('hit_list_members')
      .update({ status: 'member' })
      .eq('list_id', listId)
      .eq('user_id', uid)
      .select('*');
    if (error) throw fail(error);
    loads.take(uid);
    const rows = (data ?? []) as Row[];
    removeItem();
    if (rows.length === 0) {
      await deleteMember(db, listId, uid);
      throw new NotAllowedError(INVITATION_WITHDRAWN);
    }
    await mirrorAnswer(() => upsertMembers(db, rows.map(memberFromServer)));
  } else {
    const { error } = await client.from('hit_list_members').delete().eq('list_id', listId).eq('user_id', uid);
    if (error) throw fail(error);
    loads.take(uid);
    removeItem();
    await mirrorAnswer(() => deleteMember(db, listId, uid));
  }
  await reloadStoresQuietly(db);
  return true;
}

/** The server took the answer: a failed mirror write only warns (the next pull's full members read rewrites it). */
async function mirrorAnswer(write: () => Promise<unknown>): Promise<void> {
  try {
    await write();
  } catch (err) {
    console.warn('[lists] the answer is in; mirroring it failed:', errorMessage(err));
  }
}

interface InvitationRow {
  list_id: string;
  name: string;
  kind: string;
  owner_id: string;
  owner_username: string | null;
  owner_display_name: string | null;
  role: string;
  spot_count: number;
  invited_at: string;
}

/**
 * The rider's open invitations (list_invitations, D83: name, kind, owner, role and spot count; no spots), newest
 * first, as Inbox items. Null without a session for `uid`; throws when the server can't be read.
 */
export async function loadInvites(client: SupabaseClient, uid: string): Promise<InviteItem[] | null> {
  const { data: session } = await client.auth.getSession();
  if (session.session?.user.id !== uid) return null;
  const { data, error } = await client.rpc('list_invitations');
  if (error) throw serverError(error);
  return ((data ?? []) as InvitationRow[])
    .map(
      (row): InviteItem => ({
        kind: 'invite',
        id: row.list_id,
        created_at: toIso(row.invited_at) ?? row.invited_at,
        listId: row.list_id,
        listName: row.name,
        listKind: row.kind as HitListKind,
        from: { id: row.owner_id, username: row.owner_username, display_name: row.owner_display_name },
        role: row.role as MemberRole,
        spotCount: row.spot_count,
      }),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

const loads = createTickets();

/**
 * Loads the invitations into the Inbox (kind 'invite') and the owners' names into the profiles mirror (D72). The
 * engine runs it after the sends load. Drops the result when a newer load or an answer started meanwhile, or when
 * the phone is no longer `uid`'s. Never rejects: an error warns.
 */
export async function loadAndApplyInvites(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
  ticket: number = loads.take(uid),
): Promise<void> {
  try {
    const items = await loadInvites(client, uid);
    if (!items || !loads.isNewest(uid, ticket) || !(await maySync(db, client, uid))) return;
    const owners: FriendProfile[] = items.map((i) => i.from).filter((p) => p.username !== null);
    await upsertProfiles(db, owners);
    // an answer that started during the awaits above takes a newer ticket
    if (loads.isNewest(uid, ticket)) useInboxStore.getState().setItems(uid, 'invite', items);
  } catch (err) {
    console.warn('[lists] loading invitations failed:', errorMessage(err));
  }
}
