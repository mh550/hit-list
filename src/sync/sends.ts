import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { addSpotsToList, getMediaForSpot, getSpot, insertHitList, insertMedia, insertSpot } from '@/src/db';
import { getProfiles } from '@/src/db/profiles';
import { useInboxStore, type SendItem } from '@/src/stores/inbox-store';
import type { FriendProfile, Media, Spot } from '@/src/types';
import { newId } from '@/src/utils/id';
import {
  freezeSend,
  MAX_SEND_SPOTS,
  parseSendPayload,
  thawSend,
  type SendDownload,
  type SendSender,
} from '@/src/utils/send-payload';
import { maySync, signedInAs } from './account';
import { errorMessage, serverError } from './errors';
import { createTickets } from './tickets';
import { readProfiles } from './friends';
import { createSendLink, listMyLinks, revokeLink, type LinkExpiry } from './links';
import { blobBytes, defaultPhotoIO, PHOTOS_BUCKET, storagePath, type PhotoIO } from './photos';
import { runExclusive } from './queue';
import { reloadStoresQuietly } from './reload';
import { serverTime } from './time';

/*
 * Send (S7, docs/plans/2026-10-22-s7-send.md "Photo copy", "Inbox", "Sent"): a one-time frozen copy of spots to
 * friends (D40). The server decides who reads what (sends RLS, can_read_send, the staged-photo policies of migration
 * 20261024010000_sends_s7); every call takes the client and the rider and does nothing without a session for that
 * rider, so one process can run several riders (the integration test).
 */

/** Rows per page (PostgREST caps a response at 1000). */
const PAGE = 500;
const SEND_COLUMNS = 'id,sender,recipient,payload,created_at,saved_at,dismissed_at,withdrawn_at';

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
  send: { spotIds: string[]; recipientIds: string[]; sender: SendSender },
): Promise<SendResult | null> {
  const spotIds = sendSpotIds(send.spotIds);
  // a friend given twice gets one send
  const recipientIds = [...new Set(send.recipientIds)];
  const { sender } = send;
  if (recipientIds.length === 0) throw new Error('a send needs at least one friend');
  if (!(await signedInAs(client, uid))) return null;

  const { spots, mediaBySpot } = await sendContents(db, uid, spotIds);
  const recipients = await friendProfiles(db, recipientIds);
  const result: SendResult = { sentTo: [] };

  for (const to of recipients) {
    const sent = await sendOnce(client, uid, { sender, spots, mediaBySpot }, to.id);
    if ('failure' in sent) {
      console.warn('[sends] sending failed:', sent.failure);
      return { ...result, failed: { to, message: sent.failure } };
    }
    result.sentTo.push(to);
  }
  return result;
}

/** The checks every send makes before any call: 1–100 spots, each given once. */
function sendSpotIds(spotIds: string[]): string[] {
  // a spot given twice goes once (a second copy of a photo would collide in Storage)
  const ids = [...new Set(spotIds)];
  if (ids.length === 0) throw new Error('a send needs at least one spot');
  if (ids.length > MAX_SEND_SPOTS) throw new Error(`a send has at most ${MAX_SEND_SPOTS} spots`);
  return ids;
}

/**
 * One send of `spots` to `recipient` (null: a link-only send, S9): a new send id, every photo copied server-side to
 * sends/<id>/ (D77), then create_send. A failure removes that send's copies when the send surely isn't there.
 */
async function sendOnce(
  client: SupabaseClient,
  uid: string,
  { sender, spots, mediaBySpot }: { sender: SendSender; spots: Spot[]; mediaBySpot: Record<string, Media[]> },
  recipient: string | null,
): Promise<{ sendId: string; photoPaths: string[] } | { failure: string }> {
  const bucket = client.storage.from(PHOTOS_BUCKET);
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
  } catch (err) {
    await removeObjects(client, copied);
    return { failure: errorMessage(err) };
  }
  const { error } = await client.rpc('create_send', { p_id: sendId, p_recipient: recipient, p_payload: payload });
  // a lost answer after the send went in: it is sent, and its photos must stay
  const exists = error ? await sendExists(client, sendId) : true;
  if (!exists) {
    // unknown: leave the copies (account-delete sweeps staged ones) rather than empty a send that may exist
    if (exists === false) await removeObjects(client, copied);
    return { failure: error!.message };
  }
  return { sendId, photoPaths: copied };
}

/** The rider's spots for a send and their photos, re-read from SQLite (D78: NotBackedUpError otherwise). */
async function sendContents(db: SQLiteDatabase, uid: string, spotIds: string[]) {
  const spots = await readySpots(db, uid, spotIds);
  const mediaBySpot = Object.fromEntries(
    await Promise.all(spots.map(async (spot) => [spot.id, await getMediaForSpot(db, spot.id)] as const)),
  );
  return { spots, mediaBySpot };
}

/**
 * A link-only send (S9, D94 *default*): one send of `spotIds` to nobody (recipient null), its photos under
 * sends/<id>/, for a link made next. The same checks as createSend; throws on any failure (there is no friend to
 * name). Null without a session for `uid`.
 */
export async function createLinkSend(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
  send: { spotIds: string[]; sender: SendSender },
): Promise<{ sendId: string; photoPaths: string[] } | null> {
  const spotIds = sendSpotIds(send.spotIds);
  if (!(await signedInAs(client, uid))) return null;
  const contents = await sendContents(db, uid, spotIds);
  const sent = await sendOnce(client, uid, { sender: send.sender, ...contents }, null);
  if ('failure' in sent) throw new Error(sent.failure);
  return sent;
}

/**
 * Copy link (S9): a link-only send of `spotIds`, then its link expiring after `expiry`. The link's URL; when the link
 * can't be made the send is withdrawn again (best effort) and the error thrown. Null without a session.
 */
export async function makeSendLink(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
  send: { spotIds: string[]; sender: SendSender; expiry: LinkExpiry },
): Promise<string | null> {
  const made = await createLinkSend(db, client, uid, send);
  if (!made) return null;
  try {
    const url = await createSendLink(client, uid, made.sendId, send.expiry);
    // the session ended in between: the send can't be withdrawn now either (account-delete removes its photos)
    if (url === null) console.warn('[sends] a link-only send was left without a link:', made.sendId);
    return url;
  } catch (err) {
    try {
      await withdrawSend(client, uid, { id: made.sendId, photoPaths: made.photoPaths });
    } catch (cleanup) {
      console.warn('[sends] withdrawing a send whose link failed:', errorMessage(cleanup));
    }
    throw err;
  }
}

/** Whether the sender's own send `id` is on the server; null when that can't be read. */
async function sendExists(client: SupabaseClient, id: string): Promise<boolean | null> {
  const { data, error } = await client.from('sends').select('id').eq('id', id).maybeSingle();
  return error ? null : data !== null;
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

const loads = createTickets();

/**
 * Loads the sends to the rider into the Inbox (kind 'send'). The engine runs it after the friends load, inside its
 * task. Drops the result when a newer load or a save started meanwhile, or when the session or the phone's account
 * is no longer `uid`'s. Never rejects: an error warns.
 */
export async function loadAndApplySends(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
  ticket: number = loads.take(uid),
): Promise<void> {
  try {
    const items = await loadSends(client, uid);
    if (!items || !loads.isNewest(uid, ticket) || !(await maySync(db, client, uid))) return;
    // a save the server may have marked lists it saved, but its copies wait for Try again: keep its item
    const inbox = useInboxStore.getState();
    const waiting =
      inbox.userId === uid
        ? inbox.items.filter(
            (i): i is SendItem =>
              i.kind === 'send' && hasPendingSave(uid, i.sendId) && !items.some((n) => n.id === i.id),
          )
        : [];
    inbox.setItems(uid, 'send', [...items, ...waiting].sort(newestFirst));
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

type SaveOptions = { spotIds?: readonly string[]; newList?: boolean };

/**
 * A save the server may already have marked (its answer was lost, or the inserts failed after it), kept in memory by
 * `<uid>:<sendId>` so the next tap retries it as it was: the same save token (mark_send_saved accepts it again), the
 * same new ids and the files already downloaded, inserting only what isn't on the phone yet. An app restart forgets
 * it; the send then reads as saved with no copies (the accepted crash case).
 */
interface PendingSave {
  token: string;
  now: string;
  listId: string | null;
  spots: Spot[];
  media: Media[];
  downloads: SendDownload[];
  /** relative paths written so far */
  written: string[];
  /** media ids whose photo couldn't be downloaded */
  failed: Set<string>;
  downloaded: boolean;
  mayBeMarked: boolean;
}
const pendingSaves = new Map<string, PendingSave>();

/**
 * Whether `uid`'s save of `sendId` is running or waits for its retry. A retry repeats the first choice (all, picked,
 * into a new list), so the Inbox offers only Try again then.
 */
export const hasPendingSave = (uid: string, sendId: string) => pendingSaves.has(`${uid}:${sendId}`);

/**
 * Saves a received send as the rider's own spots (all of them, or `spotIds`; picking finishes the send, D81), with
 * `newList` also into a new hit list 'From @ana'. Order: download every photo into photos/<newSpot>/<newMedia>.jpg (a
 * failed one is left out and counted; none at all saves nothing, and a retry downloads the failed ones again), then, on the sync queue, mark_send_saved and the inserts through src/db (owned
 * by `uid`, so they queue for backup), so a withdrawal racing the save never leaves copies of a withdrawn send. Then
 * the stores reload and the item leaves the Inbox. Single-flight per send; null without a session for `uid`.
 */
export function saveSend(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
  item: SendItem,
  opts: SaveOptions = {},
  io: PhotoIO = defaultPhotoIO,
): Promise<SaveResult | null> {
  const running = saving.get(item.sendId);
  if (running) return running;
  const save = saveOnce(db, client, uid, item, opts, io).finally(() => saving.delete(item.sendId));
  saving.set(item.sendId, save);
  return save;
}

function startSave(uid: string, item: SendItem, opts: SaveOptions): PendingSave {
  const now = new Date().toISOString();
  const thawed = thawSend(item.payload, { sendId: item.sendId, uid, now, newId, spotIds: opts.spotIds });
  if (thawed.spots.length === 0) throw new Error('pick at least one spot to save');
  return {
    token: newId(),
    now,
    listId: opts.newList ? newId() : null,
    ...thawed,
    written: [],
    failed: new Set(),
    downloaded: false,
    mayBeMarked: false,
  };
}

/** The first time every photo, after that only the ones that failed (a retry once the phone is back online). */
async function downloadPhotos(client: SupabaseClient, save: PendingSave, io: PhotoIO): Promise<void> {
  const todo = save.downloaded ? save.downloads.filter((d) => save.failed.has(d.mediaId)) : save.downloads;
  for (const download of todo) {
    try {
      const { data, error } = await client.storage.from(PHOTOS_BUCKET).download(download.path);
      if (error) throw serverError(error);
      io.write(download.localRelativePath, await blobBytes(data));
      save.written.push(download.localRelativePath);
      save.failed.delete(download.mediaId);
    } catch (err) {
      save.failed.add(download.mediaId);
      console.warn(`[sends] could not download photo ${download.path}:`, errorMessage(err));
    }
  }
  save.downloaded = true;
}

const isOnPhone = async (db: SQLiteDatabase, table: 'spots' | 'media' | 'hit_lists', id: string) =>
  (await db.getFirstAsync(`SELECT 1 AS here FROM ${table} WHERE id = ?`, id)) !== null;

/** The copies through src/db; a row a failed earlier try already wrote is skipped, so a retry writes each once. */
async function insertCopies(db: SQLiteDatabase, uid: string, item: SendItem, save: PendingSave): Promise<void> {
  const arrived = save.media.filter((m) => !save.failed.has(m.id));
  for (const spot of save.spots) {
    if (await isOnPhone(db, 'spots', spot.id)) continue;
    const primary = arrived.find((m) => m.spot_id === spot.id);
    await insertSpot(db, { ...spot, primary_photo_id: primary?.id });
  }
  for (const m of arrived) if (!(await isOnPhone(db, 'media', m.id))) await insertMedia(db, m);
  if (!save.listId) return;
  if (!(await isOnPhone(db, 'hit_lists', save.listId))) {
    await insertHitList(db, {
      id: save.listId,
      name: `From @${item.from.username}`,
      kind: 'manual',
      shared: false,
      created_at: save.now,
      updated_at: save.now,
      owner_id: uid,
    });
  }
  await addSpotsToList(
    db,
    save.listId,
    save.spots.map((s) => s.id),
  );
}

async function saveOnce(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
  item: SendItem,
  opts: SaveOptions,
  io: PhotoIO,
): Promise<SaveResult | null> {
  // a sends load already running would put this item back after it leaves
  loads.take(uid);
  if (!(await signedInAs(client, uid))) return null;
  const key = `${uid}:${item.sendId}`;
  const save = pendingSaves.get(key) ?? startSave(uid, item, opts);
  pendingSaves.set(key, save);
  await downloadPhotos(client, save, io);

  /** Drops the save; its downloads go too unless they are the copies' files now. */
  const forget = (deleteFiles: boolean) => {
    pendingSaves.delete(key);
    if (!deleteFiles) return;
    for (const path of save.written) {
      try {
        io.remove(path);
      } catch (err) {
        console.warn('[sends] could not delete a downloaded photo:', errorMessage(err));
      }
    }
  };

  // Offline, every download fails: saving now would use up the send on copies with no photos.
  if (save.downloads.length > 0 && save.failed.size === save.downloads.length) {
    if (!save.mayBeMarked) forget(true);
    return { status: 'failed' };
  }

  const result = await runExclusive(async (): Promise<SaveResult> => {
    const marked = (await maySync(db, client, uid)) ? await markSaved(client, uid, item.sendId, save.token) : 'no_session';
    if (marked === 'already_saved' || marked === 'taken_back') {
      forget(true);
      return { status: marked };
    }
    if (marked === 'no_session') {
      if (!save.mayBeMarked) forget(true);
      return { status: 'failed' };
    }
    save.mayBeMarked = true;
    if (marked === 'unknown') return { status: 'failed' };
    try {
      await insertCopies(db, uid, item, save);
    } catch (err) {
      console.warn('[sends] saving the copies on the phone failed:', errorMessage(err));
      return { status: 'failed' };
    }
    forget(false);
    const saved: SaveResult = { status: 'saved', saved: save.spots.length, failedPhotos: save.failed.size };
    return save.listId ? { ...saved, listId: save.listId } : saved;
  });

  if (result.status === 'saved') await reloadStoresQuietly(db);
  if (result.status !== 'failed') {
    // a load started while this save ran read the server before the mark
    loads.take(uid);
    useInboxStore.getState().removeItem(uid, 'send', item.id);
  }
  return result;
}

/**
 * mark_send_saved with this save's token. 42501 is also "not signed in", so the session decides first; any other
 * error may be a lost answer after the server saved it ('unknown': the retry sends the same token).
 */
async function markSaved(
  client: SupabaseClient,
  uid: string,
  sendId: string,
  token: string,
): Promise<'saved' | 'already_saved' | 'taken_back' | 'no_session' | 'unknown'> {
  const { error } = await client.rpc('mark_send_saved', { p_id: sendId, p_token: token });
  if (!error) return 'saved';
  console.warn('[sends] saving a send failed:', error.message);
  if (!(await signedInAs(client, uid))) return 'no_session';
  if (error.code === '55000') return 'already_saved';
  if (error.code === '42501') return 'taken_back';
  return 'unknown';
}

/** Dismiss a send (the sender isn't told); one already gone (withdrawn, blocked) leaves the Inbox too. */
export async function dismissSend(client: SupabaseClient, uid: string, sendId: string): Promise<void> {
  if (!(await signedInAs(client, uid))) return;
  // a sends load already running would put this item back after it leaves
  loads.take(uid);
  const { error } = await client.rpc('dismiss_send', { p_id: sendId });
  if (error && !(error.code === '42501' && (await signedInAs(client, uid)))) throw serverError(error);
  // and one started while the rpc ran
  loads.take(uid);
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
      photoPaths: payload.spots.flatMap((s) => s.photos.map((p) => p.path)),
    };
  } catch (err) {
    console.warn(`[sends] reading sent payload ${row.id} failed:`, errorMessage(err));
    return { count: 0, photoPaths: [] };
  }
}

/**
 * The rider's sends to friends (link sends: listSentLinks), newest first, each with its friend (the server's profile, then
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

/** One send link the rider made, for the Sent screen's Links (D94: a link-only send each). */
export interface SentLink {
  /** the link's id */
  id: string;
  sendId: string;
  count: number;
  /** a link whose send was withdrawn reads 'revoked' (D93) */
  status: 'active' | 'expired' | 'revoked';
  createdAt: string;
  /** null = never */
  expiresAt: string | null;
  /** the send's photo objects, removed on Revoke */
  photoPaths: string[];
}

/**
 * The rider's send links, newest first, each with its link-only send's spot count and photos. A link whose send is
 * withdrawn but whose revoke didn't go through reads 'revoked', and the revoke is retried in the background. A link
 * whose send can't be read is left out. Null without a session; throws when the server can't be read.
 */
export async function listSentLinks(client: SupabaseClient, uid: string): Promise<SentLink[] | null> {
  const links = await listMyLinks(client, uid, 'send');
  if (!links) return null;
  const sends = new Map(
    (await readSends(client, (q) => q.eq('sender', uid).is('recipient', null))).map((row) => [row.id, row]),
  );
  const result: SentLink[] = [];
  for (const link of links) {
    const send = link.sendId ? sends.get(link.sendId) : undefined;
    if (!send) continue;
    const halfRevoked = send.withdrawn_at !== null && link.status !== 'revoked';
    if (halfRevoked) {
      revokeLink(client, uid, link.id).catch((err: unknown) =>
        console.warn('[sends] revoking a withdrawn send’s link failed:', errorMessage(err)),
      );
    }
    result.push({
      id: link.id,
      sendId: send.id,
      ...payloadPhotoPaths(send),
      status: halfRevoked || link.status === 'revoked' ? 'revoked' : link.status === 'expired' ? 'expired' : 'active',
      createdAt: link.createdAt,
      expiresAt: link.expiresAt,
    });
  }
  return result;
}

/**
 * Revoke a send link (D93 *default*): its link-only send is withdrawn first (the preview hides a withdrawn send, so
 * the link is dead from there; its photos go), then the link is revoked. Throws when either fails; null without a
 * session.
 */
export async function revokeSentLink(
  client: SupabaseClient,
  uid: string,
  link: Pick<SentLink, 'id' | 'sendId' | 'photoPaths'>,
): Promise<true | null> {
  if ((await withdrawSend(client, uid, { id: link.sendId, photoPaths: link.photoPaths })) === null) return null;
  return revokeLink(client, uid, link.id);
}
