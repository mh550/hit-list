import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { addSpotsToList, getMediaForSpot, getSpot, insertHitList, insertMedia, insertSpot } from '@/src/db';
import { getProfiles } from '@/src/db/profiles';
import { useInboxStore, type SendItem } from '@/src/stores/inbox-store';
import type { FriendProfile, Spot } from '@/src/types';
import { newId } from '@/src/utils/id';
import {
  freezeSend,
  MAX_SEND_SPOTS,
  parseSendPayload,
  sendPhotoPath,
  thawSend,
  type SendSender,
} from '@/src/utils/send-payload';
import { maySync, signedInAs } from './account';
import { errorMessage } from './errors';
import { readProfiles } from './friends';
import { blobBytes, defaultPhotoIO, PHOTOS_BUCKET, storagePath, type PhotoIO } from './photos';
import { runExclusive } from './queue';
import { reloadStoresQuietly } from './reload';
import { toIso } from './time';

/*
 * Send (S7, docs/plans/2026-10-22-s7-send.md "Photo copy", "Inbox", "Sent"): a one-time frozen copy of spots to
 * friends (D40). The server decides who reads what (sends RLS, can_read_send, the staged-photo policies of migration
 * 20261024010000_sends_s7); every call takes the client and the rider and does nothing without a session for that
 * rider, so one process can run several riders (the integration test).
 */

/** Rows per page (PostgREST caps a response at 1000). */
const PAGE = 500;
const SEND_COLUMNS = 'id,sender,recipient,payload,created_at,saved_at,dismissed_at,withdrawn_at';

type ServerError = { message: string; code?: string };
const serverError = (error: ServerError) => Object.assign(new Error(error.message), { code: error.code });

interface SendRow {
  id: string;
  sender: string;
  recipient: string | null;
  payload: unknown;
  created_at: string;
  saved_at: string | null;
  dismissed_at: string | null;
  withdrawn_at: string | null;
}

/** Some spots can't be sent yet (D78): not the rider's, not on the phone, or a change of them not backed up. */
export class NotBackedUpError extends Error {
  constructor(readonly count: number) {
    super(`${count} ${count === 1 ? 'spot is' : 'spots are'} not backed up yet`);
    this.name = 'NotBackedUpError';
  }
}

export interface SendResult {
  sentTo: FriendProfile[];
  /** the friend the send stopped at; the ones before it got theirs */
  failed?: { to: FriendProfile; message: string };
}

/** Best-effort remove of objects in the photos bucket; a failure or a short answer only warns. */
async function removeObjects(client: SupabaseClient, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    const { data, error } = await client.storage.from(PHOTOS_BUCKET).remove(paths);
    if (error) throw serverError(error);
    if (data.length !== paths.length) console.warn(`[sends] removed ${data.length} of ${paths.length} photos`);
  } catch (err) {
    console.warn('[sends] removing photos failed:', errorMessage(err));
  }
}

/** The spots to send, re-read from SQLite; throws NotBackedUpError unless every one is the rider's and backed up. */
async function readySpots(db: SQLiteDatabase, uid: string, spotIds: string[]): Promise<Spot[]> {
  const spots = await Promise.all(spotIds.map((id) => getSpot(db, id)));
  const ids = JSON.stringify(spotIds);
  const waiting = await db.getAllAsync<{ spot_id: string }>(
    `SELECT entity_id AS spot_id FROM sync_outbox WHERE entity = 'spot' AND entity_id IN (SELECT value FROM json_each(?))
     UNION
     SELECT m.spot_id FROM sync_outbox o JOIN media m ON m.id = o.entity_id
     WHERE o.entity = 'media' AND m.deleted_at IS NULL AND m.spot_id IN (SELECT value FROM json_each(?))`,
    ids,
    ids,
  );
  const notReady = new Set(waiting.map((w) => w.spot_id));
  spotIds.forEach((id, i) => {
    if (spots[i]?.owner_id !== uid) notReady.add(id);
  });
  if (notReady.size > 0) throw new NotBackedUpError(notReady.size);
  return spots as Spot[];
}

/** Names for friend ids from the phone's mirror (D72); an id it has no name for reads as a nameless rider. */
async function friendProfiles(db: SQLiteDatabase, ids: string[]): Promise<FriendProfile[]> {
  const mirrored = await getProfiles(db, ids);
  return ids.map((id) => mirrored[id] ?? { id, username: null, display_name: null });
}

/**
 * Sends `spotIds` to each friend in `recipientIds`: per friend a new send id, every photo copied server-side to
 * sends/<id>/ (D77, before the row exists, so the friend never reads a send with a photo missing), then create_send
 * (D76: one row and one photo set per friend). A failure removes that send's copies and stops; the friends before it
 * got theirs. Throws before any call for 0 or more than 100 spots, no friend, or a spot not backed up (D78). Null
 * without a session for `uid`. `sender` goes into the payload, but the server writes its own (D80).
 */
export async function createSend(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
  { spotIds, recipientIds, sender }: { spotIds: string[]; recipientIds: string[]; sender: SendSender },
): Promise<SendResult | null> {
  if (spotIds.length === 0) throw new Error('a send needs at least one spot');
  if (spotIds.length > MAX_SEND_SPOTS) throw new Error(`a send has at most ${MAX_SEND_SPOTS} spots`);
  if (recipientIds.length === 0) throw new Error('a send needs at least one friend');
  if (!(await signedInAs(client, uid))) return null;

  const spots = await readySpots(db, uid, spotIds);
  const mediaBySpot = Object.fromEntries(
    await Promise.all(spots.map(async (spot) => [spot.id, await getMediaForSpot(db, spot.id)] as const)),
  );
  const recipients = await friendProfiles(db, recipientIds);
  const bucket = client.storage.from(PHOTOS_BUCKET);
  const result: SendResult = { sentTo: [] };

  for (const to of recipients) {
    const sendId = newId();
    const payload = freezeSend({ sendId, sender, spots, mediaBySpot });
    const copied: string[] = [];
    try {
      for (const spot of payload.spots) {
        for (const photo of spot.photos) {
          const { error } = await bucket.copy(storagePath(uid, { id: photo.media_id, spot_id: spot.id }), photo.path);
          if (error) throw serverError(error);
          copied.push(photo.path);
        }
      }
      const { error } = await client.rpc('create_send', { p_id: sendId, p_recipient: to.id, p_payload: payload });
      if (error) throw serverError(error);
    } catch (err) {
      console.warn('[sends] sending failed:', errorMessage(err));
      await removeObjects(client, copied);
      return { ...result, failed: { to, message: errorMessage(err) } };
    }
    result.sentTo.push(to);
  }
  return result;
}

/** Every row of the sends the rider may read that `filter` keeps, in pages by id. */
async function readSends(
  client: SupabaseClient,
  filter: (query: ReturnType<ReturnType<SupabaseClient['from']>['select']>) => typeof query,
): Promise<SendRow[]> {
  const rows: SendRow[] = [];
  let last: string | null = null;
  for (;;) {
    let query = filter(client.from('sends').select(SEND_COLUMNS));
    if (last !== null) query = query.gt('id', last);
    const { data, error } = await query.order('id').limit(PAGE);
    if (error) throw serverError(error);
    const page = (data ?? []) as unknown as SendRow[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
    last = page[page.length - 1].id;
  }
}

const serverTime = (value: string) => toIso(value) ?? value;
const newestFirst = (a: { created_at: string }, b: { created_at: string }) => b.created_at.localeCompare(a.created_at);

/**
 * The sends to the rider still waiting for an answer (not saved, not dismissed; RLS hides withdrawn ones and a
 * blocked sender's), newest first, as Inbox items. A payload that isn't a send warns and is skipped. Null without a
 * session for `uid`; throws when the server can't be read.
 */
export async function loadSends(client: SupabaseClient, uid: string): Promise<SendItem[] | null> {
  if (!(await signedInAs(client, uid))) return null;
  const rows = await readSends(client, (q) =>
    q.eq('recipient', uid).is('saved_at', null).is('dismissed_at', null).is('withdrawn_at', null),
  );
  const items: SendItem[] = [];
  for (const row of rows) {
    try {
      const payload = parseSendPayload(row.payload, row.id);
      items.push({
        kind: 'send',
        id: row.id,
        sendId: row.id,
        created_at: serverTime(row.created_at),
        from: payload.sender,
        payload,
      });
    } catch (err) {
      console.warn(`[sends] skipping send ${row.id}:`, errorMessage(err));
    }
  }
  return items.sort(newestFirst);
}

/** The newest sends load asked for, per rider: an older one that ends later must not put back what a save took off. */
const newestTicket = new Map<string, number>();
let tickets = 0;

function takeTicket(uid: string): number {
  tickets += 1;
  newestTicket.set(uid, tickets);
  return tickets;
}

/**
 * Loads the sends to the rider into the Inbox (kind 'send'). The engine runs it after the friends load, inside its
 * task. Drops the result when a newer load or a save started meanwhile, or when the session or the phone's account
 * is no longer `uid`'s. Never rejects: an error warns.
 */
export async function loadAndApplySends(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
  ticket: number = takeTicket(uid),
): Promise<void> {
  try {
    const items = await loadSends(client, uid);
    if (!items || newestTicket.get(uid) !== ticket || !(await maySync(db, client, uid))) return;
    useInboxStore.getState().setItems(uid, 'send', items);
  } catch (err) {
    console.warn('[sends] loading sends failed:', errorMessage(err));
  }
}

export type SaveResult =
  | { status: 'saved'; saved: number; failedPhotos: number; listId?: string }
  /** saved already (another phone, a stale item): nothing new on this phone */
  | { status: 'already_saved' }
  /** the sender withdrew it, or the rider can't read it any more */
  | { status: 'taken_back' }
  /** nothing saved; the item stays to try again */
  | { status: 'failed' };

/** One save per send at a time: a second tap shares the first. */
const saving = new Map<string, Promise<SaveResult | null>>();

/**
 * Saves a received send as the rider's own spots (all of them, or `spotIds`; picking finishes the send, D81), with
 * `newList` also into a new hit list 'From @ana'. Order: download every photo into photos/<newSpot>/<newMedia>.jpg (a
 * failed one is left out and counted), then, on the sync queue, mark_send_saved and the inserts through src/db (owned
 * by `uid`, so they queue for backup), so a withdrawal racing the save never leaves copies of a withdrawn send. Then
 * the stores reload and the item leaves the Inbox. Single-flight per send; null without a session for `uid`.
 */
export function saveSend(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
  item: SendItem,
  opts: { spotIds?: readonly string[]; newList?: boolean } = {},
  io: PhotoIO = defaultPhotoIO,
): Promise<SaveResult | null> {
  const running = saving.get(item.sendId);
  if (running) return running;
  const save = saveOnce(db, client, uid, item, opts, io).finally(() => saving.delete(item.sendId));
  saving.set(item.sendId, save);
  return save;
}

async function saveOnce(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
  item: SendItem,
  opts: { spotIds?: readonly string[]; newList?: boolean },
  io: PhotoIO,
): Promise<SaveResult | null> {
  // a sends load already running would put this item back after it leaves
  takeTicket(uid);
  if (!(await signedInAs(client, uid))) return null;
  const now = new Date().toISOString();
  const { spots, media, downloads } = thawSend(item.payload, {
    sendId: item.sendId,
    uid,
    now,
    newId,
    spotIds: opts.spotIds,
  });
  if (spots.length === 0) throw new Error('pick at least one spot to save');

  const written: string[] = [];
  const failed = new Set<string>();
  for (const download of downloads) {
    try {
      const { data, error } = await client.storage.from(PHOTOS_BUCKET).download(download.path);
      if (error) throw serverError(error);
      io.write(download.localRelativePath, await blobBytes(data));
      written.push(download.localRelativePath);
    } catch (err) {
      failed.add(download.mediaId);
      console.warn(`[sends] could not download photo ${download.path}:`, errorMessage(err));
    }
  }
  const deleteDownloads = () => {
    for (const path of written) {
      try {
        io.remove(path);
      } catch (err) {
        console.warn('[sends] could not delete a downloaded photo:', errorMessage(err));
      }
    }
  };

  const result = await runExclusive(async (): Promise<SaveResult> => {
    if (!(await maySync(db, client, uid))) {
      deleteDownloads();
      return { status: 'failed' };
    }
    const marked = await markSaved(client, uid, item.sendId);
    if (marked !== 'saved') {
      deleteDownloads();
      return { status: marked };
    }
    const arrived = media.filter((m) => !failed.has(m.id));
    for (const spot of spots) {
      const primary = arrived.find((m) => m.spot_id === spot.id);
      await insertSpot(db, { ...spot, primary_photo_id: primary?.id });
    }
    for (const m of arrived) await insertMedia(db, m);
    const saved: SaveResult = { status: 'saved', saved: spots.length, failedPhotos: failed.size };
    if (!opts.newList) return saved;
    const listId = newId();
    await insertHitList(db, {
      id: listId,
      name: `From @${item.from.username}`,
      kind: 'manual',
      shared: false,
      created_at: now,
      updated_at: now,
      owner_id: uid,
    });
    await addSpotsToList(
      db,
      listId,
      spots.map((s) => s.id),
    );
    return { ...saved, listId };
  });

  if (result.status === 'saved') await reloadStoresQuietly(db);
  if (result.status !== 'failed') useInboxStore.getState().removeItem(uid, 'send', item.id);
  return result;
}

/** mark_send_saved, and what an error means (a lost answer after the server saved it still counts as saved). */
async function markSaved(
  client: SupabaseClient,
  uid: string,
  sendId: string,
): Promise<'saved' | 'already_saved' | 'taken_back' | 'failed'> {
  const { error } = await client.rpc('mark_send_saved', { p_id: sendId });
  if (!error) return 'saved';
  console.warn('[sends] saving a send failed:', error.message);
  // 42501 is also "not signed in"
  if (!(await signedInAs(client, uid))) return 'failed';
  if (error.code === '55000') return 'already_saved';
  const row = await client.from('sends').select('saved_at').eq('id', sendId).maybeSingle<{ saved_at: string | null }>();
  if (row.error) return 'failed';
  if (!row.data) return 'taken_back';
  return row.data.saved_at ? 'saved' : 'failed';
}

/** Dismiss a send (the sender isn't told); one already gone (withdrawn, blocked) leaves the Inbox too. */
export async function dismissSend(client: SupabaseClient, uid: string, sendId: string): Promise<void> {
  if (!(await signedInAs(client, uid))) return;
  const { error } = await client.rpc('dismiss_send', { p_id: sendId });
  if (error && !(error.code === '42501' && (await signedInAs(client, uid)))) throw serverError(error);
  useInboxStore.getState().removeItem(uid, 'send', sendId);
}

export type SentStatus = 'waiting' | 'saved' | 'withdrawn';

/** One send the rider made to a friend, for the Sent screen. */
export interface SentSend {
  id: string;
  to: FriendProfile;
  count: number;
  /** a dismissed send reads 'waiting' (D82) */
  status: SentStatus;
  created_at: string;
  /** the send's photo objects, removed on Withdraw */
  photoPaths: string[];
}

/**
 * Take a send back until it is saved (D40), then remove its photos (best effort). 'saved' when the friend saved it
 * first (55000); null without a session for `uid`.
 */
export async function withdrawSend(
  client: SupabaseClient,
  uid: string,
  send: Pick<SentSend, 'id' | 'photoPaths'>,
): Promise<'withdrawn' | 'saved' | null> {
  if (!(await signedInAs(client, uid))) return null;
  const { error } = await client.rpc('withdraw_send', { p_id: send.id });
  if (error?.code === '55000') return 'saved';
  if (error) throw serverError(error);
  await removeObjects(client, send.photoPaths);
  return 'withdrawn';
}

/** The photo paths of a payload the rider made; one this app can't read has none. */
function payloadPhotoPaths(row: SendRow): { count: number; photoPaths: string[] } {
  try {
    const payload = parseSendPayload(row.payload, row.id);
    return {
      count: payload.spots.length,
      photoPaths: payload.spots.flatMap((s) => s.photos.map((p) => sendPhotoPath(row.id, p.media_id))),
    };
  } catch (err) {
    console.warn(`[sends] reading sent payload ${row.id} failed:`, errorMessage(err));
    return { count: 0, photoPaths: [] };
  }
}

/**
 * The rider's sends to friends (link sends are S9), newest first, each with its friend (the server's profile, then
 * the phone's mirror, else nameless), spot count and status. Null without a session for `uid`; throws when the server
 * can't be read.
 */
export async function listSent(db: SQLiteDatabase, client: SupabaseClient, uid: string): Promise<SentSend[] | null> {
  if (!(await signedInAs(client, uid))) return null;
  const rows = (await readSends(client, (q) => q.eq('sender', uid))).filter(
    (row): row is SendRow & { recipient: string } => row.recipient !== null,
  );
  const ids = [...new Set(rows.map((r) => r.recipient))];
  const fromServer = new Map((await readProfiles(client, ids)).map((p) => [p.id, p]));
  const mirrored = await getProfiles(
    db,
    ids.filter((id) => !fromServer.get(id)?.username),
  );
  return rows
    .map((row) => ({
      id: row.id,
      to: fromServer.get(row.recipient)?.username
        ? fromServer.get(row.recipient)!
        : (mirrored[row.recipient] ?? { id: row.recipient, username: null, display_name: null }),
      ...payloadPhotoPaths(row),
      status: (row.withdrawn_at ? 'withdrawn' : row.saved_at ? 'saved' : 'waiting') as SentStatus,
      created_at: serverTime(row.created_at),
    }))
    .sort(newestFirst);
}
