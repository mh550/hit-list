import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getProfiles, upsertProfiles } from '@/src/db/profiles';
import { useFriendsStore } from '@/src/stores/friends-store';
import { useInboxStore, type FriendRequestItem } from '@/src/stores/inbox-store';
import type { FriendProfile } from '@/src/types';
import { maySync, signedInAs } from './account';
import { errorMessage } from './errors';
import { runExclusive } from './queue';
import { toIso } from './time';

/*
 * Friends (S6, docs/plans/2026-10-22-s6-friends.md "Data"): the server's functions and RLS decide everything
 * (find_profile, send_friend_request, respond_friend_request, block_user, unblock_user; friendships rows the rider is
 * in, the rider's own blocks, the profiles of friends and of riders who asked). Every call takes the client and the
 * rider and does nothing without a session for that rider, so one process can run several riders (the integration
 * test). Usernames reach the app only from find_profile (one exact name the rider typed) and from the profiles of the
 * rider's own friendships rows: no select on profiles without an id filter. The mutations only call the server; the
 * caller then runs refreshFriends.
 */

export type { FriendProfile };

/** One friendships row from the rider's side: `profile` is the other rider. */
export interface FriendRow {
  friendshipId: string;
  created_at: string;
  profile: FriendProfile;
}

export interface FriendsData {
  /** status 'accepted', by username */
  friends: FriendRow[];
  /** 'pending', asked by the other rider, newest first */
  incoming: FriendRow[];
  /** 'pending', asked by the rider, newest first; the server hides the target's name (from the mirror, D73) */
  outgoing: FriendRow[];
  /** riders the rider blocked (D74); the server hides their names too */
  blocked: FriendProfile[];
}

export type AddStatus = 'self' | 'already_friends' | 'already_sent' | 'blocked_by_me' | 'sent' | 'accepted';

/**
 * What Add by username found. 'not_found' is also a rider who blocked you, one not onboarded yet, and a block that
 * landed between find and send (D50: the blocked rider is never told, so the three read the same).
 */
export type AddResult =
  | { status: 'invalid' }
  | { found: false; status: 'not_found' }
  | { found: true; status: AddStatus; profile: FriendProfile };

/** Rows per page (PostgREST caps a response at 1000). */
const PAGE = 500;
/** Ids per profiles select, so the URL stays short. */
const PROFILE_CHUNK = 100;
const USERNAME = /^[a-z0-9_.]{3,20}$/;
const NOT_FOUND = { found: false, status: 'not_found' } as const;

type ServerError = { message: string; code?: string };
const serverError = (error: ServerError) => Object.assign(new Error(error.message), { code: error.code });

/** A typed name as the server stores it (trimmed, one leading @ dropped, lowercase), or null if it can't be one (D39). */
export function normaliseUsername(typed: string): string | null {
  const trimmed = typed.trim();
  const name = (trimmed.startsWith('@') ? trimmed.slice(1) : trimmed).toLowerCase();
  return USERNAME.test(name) ? name : null;
}

interface FriendshipRow {
  id: string;
  user_a: string;
  user_b: string;
  status: 'pending' | 'accepted';
  requested_by: string;
  created_at: string;
}

/** Every row of `table` the rider may read, in pages ordered by `key`. */
async function readAll<T extends Record<string, unknown>>(
  client: SupabaseClient,
  table: string,
  columns: string,
  key: keyof T & string,
): Promise<T[]> {
  const rows: T[] = [];
  let last: unknown = null;
  for (;;) {
    let query = client.from(table).select(columns);
    if (last !== null) query = query.gt(key, last);
    const { data, error } = await query.order(key).limit(PAGE);
    if (error) throw serverError(error);
    const page = (data ?? []) as unknown as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
    last = page[page.length - 1][key];
  }
}

/** The profiles of `ids` the server lets the rider read, by id. */
async function readProfiles(client: SupabaseClient, ids: string[]): Promise<FriendProfile[]> {
  const profiles: FriendProfile[] = [];
  for (let i = 0; i < ids.length; i += PROFILE_CHUNK) {
    const { data, error } = await client
      .from('profiles')
      .select('id,username,display_name')
      .in('id', ids.slice(i, i + PROFILE_CHUNK));
    if (error) throw serverError(error);
    profiles.push(...((data ?? []) as FriendProfile[]));
  }
  return profiles;
}

const placeholder = (id: string): FriendProfile => ({ id, username: null, display_name: null });
const newestFirst = (a: FriendRow, b: FriendRow) => b.created_at.localeCompare(a.created_at);
/** By username, riders whose name is unknown last (by id, so the order is stable). */
const byName = (a: FriendProfile, b: FriendProfile) =>
  (a.username ?? '\uffff').localeCompare(b.username ?? '\uffff') || a.id.localeCompare(b.id);
const byUsername = (a: FriendRow, b: FriendRow) => byName(a.profile, b.profile);

/** loadFriends plus the profiles the server actually returned (the only ones the mirror takes). */
async function fetchFriends(
  client: SupabaseClient,
  uid: string,
): Promise<{ data: FriendsData; returned: FriendProfile[] } | null> {
  if (!(await signedInAs(client, uid))) return null;
  // RLS returns only rows the rider is in (friendships) or made (blocks): no filter on uid needed
  const rows = await readAll<FriendshipRow & Record<string, unknown>>(
    client,
    'friendships',
    'id,user_a,user_b,status,requested_by,created_at',
    'id',
  );
  const blocks = await readAll<{ blocked: string; created_at: string }>(
    client,
    'blocks',
    'blocked,created_at',
    'blocked',
  );
  const other = (row: FriendshipRow) => (row.user_a === uid ? row.user_b : row.user_a);
  const returned = await readProfiles(client, [...new Set(rows.map(other))]);
  const byId = new Map(returned.map((p) => [p.id, { id: p.id, username: p.username, display_name: p.display_name }]));

  // a block that landed between the two reads: the rider shows as blocked only (block_user removed the friendship)
  const blockedIds = new Set(blocks.map((b) => b.blocked));
  const data: FriendsData = { friends: [], incoming: [], outgoing: [], blocked: [] };
  for (const row of rows) {
    const id = other(row);
    if (blockedIds.has(id)) continue;
    const friend = {
      friendshipId: row.id,
      created_at: toIso(row.created_at) ?? row.created_at,
      profile: byId.get(id) ?? placeholder(id),
    };
    if (row.status === 'accepted') data.friends.push(friend);
    else (row.requested_by === uid ? data.outgoing : data.incoming).push(friend);
  }
  data.friends.sort(byUsername);
  data.incoming.sort(newestFirst);
  data.outgoing.sort(newestFirst);
  data.blocked = blocks.map((b) => byId.get(b.blocked) ?? placeholder(b.blocked)).sort(byName);
  return { data, returned };
}

/**
 * The rider's friends, incoming and outgoing requests and blocks, straight from the server (names the server hides
 * are null). Null without a session for `uid`; throws when a table can't be read.
 */
export async function loadFriends(client: SupabaseClient, uid: string): Promise<FriendsData | null> {
  return (await fetchFriends(client, uid))?.data ?? null;
}

/** Puts `profiles` into the mirror on the sync queue, only while the phone is `uid`'s (never another account's). */
function mirrorProfiles(db: SQLiteDatabase, client: SupabaseClient, uid: string, profiles: FriendProfile[]) {
  void runExclusive(async () => {
    try {
      if (await maySync(db, client, uid)) await upsertProfiles(db, profiles);
    } catch (err) {
      console.warn('[friends] saving a name on the phone failed:', errorMessage(err));
    }
  });
}

/**
 * Add by exact @username. An invalid name makes no call; null without a session for `uid`. A hit goes into the
 * mirror (the rider typed it; that is how a sent request keeps its name, D73) before anything is sent. Throws on a
 * server error other than the ones mapped here.
 */
export async function addFriend(
  client: SupabaseClient,
  db: SQLiteDatabase,
  uid: string,
  typed: string,
): Promise<AddResult | null> {
  const username = normaliseUsername(typed);
  if (!username) return { status: 'invalid' };
  if (!(await signedInAs(client, uid))) return null;

  const found = await client.rpc('find_profile', { p_username: username });
  if (found.error) throw serverError(found.error);
  const hit = ((found.data ?? []) as FriendProfile[])[0];
  if (!hit) return NOT_FOUND;
  const profile: FriendProfile = {
    id: hit.id,
    username: hit.username,
    display_name: hit.display_name,
  };
  if (profile.id === uid) return { found: true, status: 'self', profile };
  mirrorProfiles(db, client, uid, [profile]);

  const [userA, userB] = uid < profile.id ? [uid, profile.id] : [profile.id, uid];
  const existing = await client
    .from('friendships')
    .select('id,status,requested_by')
    .eq('user_a', userA)
    .eq('user_b', userB)
    .maybeSingle<Pick<FriendshipRow, 'id' | 'status' | 'requested_by'>>();
  if (existing.error) throw serverError(existing.error);
  if (existing.data?.status === 'accepted') return { found: true, status: 'already_friends', profile };
  if (existing.data?.requested_by === uid) return { found: true, status: 'already_sent', profile };
  const blocked = await client.from('blocks').select('blocked').eq('blocked', profile.id).maybeSingle();
  if (blocked.error) throw serverError(blocked.error);
  if (blocked.data) return { found: true, status: 'blocked_by_me', profile };

  const sent = await client.rpc('send_friend_request', {
    p_username: username,
  });
  if (sent.error) {
    if (sent.error.code === 'P0002') return NOT_FOUND;
    // 'unblock this user first': a block added on another phone after the check above; 42501 is also 'not signed in'
    if (sent.error.code === '42501' && (await signedInAs(client, uid))) {
      return { found: true, status: 'blocked_by_me', profile };
    }
    throw serverError(sent.error);
  }
  // they had asked first: the function accepted their request
  return { found: true, status: existing.data ? 'accepted' : 'sent', profile };
}

/** Accept or decline a request; one already answered or withdrawn elsewhere resolves (the next load drops it). */
export async function respond(
  client: SupabaseClient,
  uid: string,
  friendshipId: string,
  action: 'accept' | 'decline',
): Promise<void> {
  if (!(await signedInAs(client, uid))) return;
  const { error } = await client.rpc('respond_friend_request', {
    p_id: friendshipId,
    p_action: action,
  });
  if (!error) return;
  if (error.code === '42501' && (await signedInAs(client, uid))) return;
  throw serverError(error);
}

/** Remove a friend, or Cancel a sent request: either side may delete the row. */
export async function removeFriend(client: SupabaseClient, uid: string, friendshipId: string): Promise<void> {
  if (!(await signedInAs(client, uid))) return;
  const { error } = await client.from('friendships').delete().eq('id', friendshipId);
  if (error) throw serverError(error);
}

/** Block a rider (the server also removes the friendship); one who deleted their account (P0002) is fine. */
export async function block(client: SupabaseClient, uid: string, userId: string): Promise<void> {
  if (!(await signedInAs(client, uid))) return;
  const { error } = await client.rpc('block_user', { p_user: userId });
  if (error && error.code !== 'P0002') throw serverError(error);
}

export async function unblock(client: SupabaseClient, uid: string, userId: string): Promise<void> {
  if (!(await signedInAs(client, uid))) return;
  const { error } = await client.rpc('unblock_user', { p_user: userId });
  if (error) throw serverError(error);
}

const requestItem = (row: FriendRow): FriendRequestItem => ({
  kind: 'friend_request',
  id: row.friendshipId,
  created_at: row.created_at,
  friendshipId: row.friendshipId,
  from: row.profile,
});

/** The newest load asked for, per rider: an older one that ends later must not put back what a newer one dropped. */
const newestTicket = new Map<string, number>();
let tickets = 0;

function takeTicket(uid: string): number {
  tickets += 1;
  newestTicket.set(uid, tickets);
  return tickets;
}

/**
 * Loads the rider's friends, mirrors the profiles the server returned, fills the names it hides from the mirror and
 * applies the result to the friends store. Runs on the sync queue: the engine calls it inside its task, everything
 * else through refreshFriends. Drops the result when a newer load was asked for, or when the session or the phone's
 * account (sync_state.user_id) is no longer `uid`'s. Never rejects: an error warns and lands in the store.
 */
export async function loadAndApplyFriends(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
  ticket: number = takeTicket(uid),
): Promise<void> {
  const isNewest = () => newestTicket.get(uid) === ticket;
  try {
    const fetched = await fetchFriends(client, uid);
    if (!fetched || !isNewest() || !(await maySync(db, client, uid))) return;
    const { data, returned } = fetched;
    await upsertProfiles(db, returned);
    const hidden = [...data.outgoing.map((f) => f.profile), ...data.blocked].filter((p) => p.username === null);
    const mirrored = await getProfiles(
      db,
      hidden.map((p) => p.id),
    );
    const named = (p: FriendProfile) => (p.username === null ? (mirrored[p.id] ?? p) : p);
    const filled: FriendsData = {
      ...data,
      outgoing: data.outgoing.map((f) => ({ ...f, profile: named(f.profile) })),
      blocked: data.blocked.map(named).sort(byName),
    };
    // The Inbox's seen mark loads before its items: a cold start with a stored session fires no sign-in, so nothing
    // else would read it. One that can't be read stays unloaded (badge 0); it isn't a friends load error.
    try {
      await useInboxStore.getState().loadSeen(db, uid);
    } catch (err) {
      console.warn('[friends] reading the Inbox seen mark failed:', errorMessage(err));
    }
    if (!isNewest() || !(await signedInAs(client, uid))) return;
    // both stores move together; the Inbox takes only requests asked by others (never what the rider sent)
    useFriendsStore.getState().applyFriends(uid, filled);
    useInboxStore.getState().setItems(uid, 'friend_request', filled.incoming.map(requestItem));
  } catch (err) {
    console.warn('[friends] loading friends failed:', errorMessage(err));
    if (isNewest()) useFriendsStore.getState().setLoadError(uid, errorMessage(err));
  }
}

/** loadAndApplyFriends on the sync queue (screens, after a mutation). A runExclusive task must never await it. */
export function refreshFriends(db: SQLiteDatabase, client: SupabaseClient, uid: string): Promise<void> {
  const ticket = takeTicket(uid);
  return runExclusive(() => loadAndApplyFriends(db, client, uid, ticket));
}
