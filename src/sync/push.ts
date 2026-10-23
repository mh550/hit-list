import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  BACKOFF_AFTER_ATTEMPTS,
  FAILED_AFTER_ATTEMPTS,
  getSyncState,
  markDone,
  markFailed,
  parkRow,
  peekOutbox,
  type OutboxRow,
} from '@/src/db/sync';
import { defaultPhotoIO, storagePath, uploadPhoto, type PhotoIO } from './photos';
import { toIso } from './time';

/**
 * Push (docs/plans/2026-10-22-s5-sync.md, "Push"): drains the outbox into Supabase in id order. Each row sends the
 * entity's **current** local state; the outbox row is deleted only after the server confirmed the write.
 *
 * 1. Fresh pass: rows with fewer than BACKOFF_AFTER_ATTEMPTS failures; the first failure stops the push (a
 *    membership must not reach the server before its spot, and an unreachable server fails everything anyway).
 * 2. Backoff pass: each row with BACKOFF_AFTER_ATTEMPTS ≤ attempts < FAILED_AFTER_ATTEMPTS once; a failure goes on.
 * 3. FAILED_AFTER_ATTEMPTS or more waits for Profile's Retry.
 * A refusal no retry can fix (RLS, a check, a photo file that is gone, a row of another account) is parked.
 */

const PAGE = 50;
/** PostgREST codes that mean "never": RLS refused (42501), a check failed (23514). 23503 (FK) is a normal retry. */
const PERMANENT_CODES = new Set(['42501', '23514']);
export const PHOTO_MISSING = 'photo missing';
const NOT_THIS_ACCOUNT = 'not this account';

export interface PushResult {
  /** Rows the server confirmed (or that no longer exist on the phone, so there was nothing to send). */
  pushed: number;
  /** Rows that failed or were parked in this push. */
  failed: number;
}

/** Nothing to push for this row any more (it is gone locally), or a reason to park it. */
type Sent = 'sent' | { park: string };

class ServerError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** A `{ data, error }` answer: an error throws, so every server call fails the same way. */
function check({ error }: { error: { message: string; code?: string } | null }): void {
  if (error) throw new ServerError(error.message, error.code);
}

/** Required timestamps: ISO when readable, else as stored (the server parses more than toIso; never invent one). */
const stamp = (value: string) => toIso(value) ?? value;
const optionalStamp = (value: string | null) => (value === null ? null : stamp(value));

export async function push(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
  io: PhotoIO = defaultPhotoIO,
): Promise<PushResult> {
  const result: PushResult = { pushed: 0, failed: 0 };
  if (!(await mayPush(db, client, uid))) return result;

  const tally = (outcome: Outcome) => {
    if (outcome === 'done') result.pushed += 1;
    else result.failed += 1;
  };

  for (;;) {
    const rows = await peekOutbox(db, PAGE, { skipFailed: true });
    if (rows.length === 0) break;
    for (const row of rows) {
      const outcome = await pushRow(db, client, uid, io, row);
      tally(outcome);
      if (outcome === 'failed') return result;
    }
  }

  let afterId = 0;
  for (;;) {
    const rows = await peekOutbox(db, PAGE, {
      minAttempts: BACKOFF_AFTER_ATTEMPTS,
      maxAttempts: FAILED_AFTER_ATTEMPTS,
      afterId,
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      tally(await pushRow(db, client, uid, io, row));
      afterId = row.id;
    }
  }
  return result;
}

/**
 * Only a session for `uid`, on a phone whose rows are `uid`'s (sync_state.user_id): anything else would send one
 * account's rows under another and park them all as RLS refusals.
 */
async function mayPush(db: SQLiteDatabase, client: SupabaseClient, uid: string): Promise<boolean> {
  const { data, error } = await client.auth.getSession();
  if (error || data.session?.user.id !== uid) return false;
  return (await getSyncState(db, 'user_id')) === uid;
}

type Outcome = 'done' | 'failed' | 'parked';

async function pushRow(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
  io: PhotoIO,
  row: OutboxRow,
): Promise<Outcome> {
  let sent: Sent;
  try {
    sent = await send(db, client, uid, io, row);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof ServerError && err.code && PERMANENT_CODES.has(err.code)) sent = { park: message };
    else {
      console.warn(`[sync] push ${row.entity} ${row.entity_id} failed:`, message);
      await markFailed(db, row.id, message);
      return 'failed';
    }
  }
  if (sent === 'sent') {
    await markDone(db, row.id);
    return 'done';
  }
  console.warn(`[sync] push ${row.entity} ${row.entity_id} set aside:`, sent.park);
  await parkRow(db, row.id, sent.park);
  return 'parked';
}

function send(db: SQLiteDatabase, client: SupabaseClient, uid: string, io: PhotoIO, row: OutboxRow): Promise<Sent> {
  switch (row.entity) {
    case 'spot':
      return sendSpot(db, client, uid, row.entity_id);
    case 'media':
      return sendMedia(db, client, uid, io, row.entity_id);
    case 'hit_list':
      return sendHitList(db, client, uid, row.entity_id);
    case 'hit_list_spot':
      return sendMembership(db, client, uid, row);
  }
}

interface SpotRow {
  id: string;
  owner_id: string | null;
  name: string | null;
  generated_name: string | null;
  latitude: number;
  longitude: number;
  feature_types_json: string;
  stopped: number;
  natural_speed: number | null;
  notes: string | null;
  primary_photo_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function featureTypes(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed.filter((t): t is string => typeof t === 'string');
  } catch {
    // an unreadable column reads as untagged, as getSpots does
  }
  return [];
}

/** A spot's upsert; its 'delete' is the same upsert (the row carries deleted_at; spots have no delete policy). */
async function sendSpot(db: SQLiteDatabase, client: SupabaseClient, uid: string, id: string): Promise<Sent> {
  const row = await db.getFirstAsync<SpotRow>(
    `SELECT id, owner_id, name, generated_name, latitude, longitude, feature_types_json, stopped, natural_speed, notes,
            primary_photo_id, created_at, updated_at, deleted_at FROM spots WHERE id = ?`,
    id,
  );
  if (!row) return 'sent';
  if (row.owner_id !== uid) return { park: NOT_THIS_ACCOUNT };
  check(
    await client.from('spots').upsert({
      id: row.id,
      owner_id: row.owner_id,
      name: row.name,
      generated_name: row.generated_name,
      lat: row.latitude,
      lng: row.longitude,
      feature_types: featureTypes(row.feature_types_json),
      stopped: row.stopped === 1,
      // 0 (None) is a rating; only NULL is unset
      natural_speed: row.natural_speed,
      notes: row.notes,
      primary_photo_id: row.primary_photo_id,
      created_at: stamp(row.created_at),
      updated_at: stamp(row.updated_at),
      deleted_at: optionalStamp(row.deleted_at),
    }),
  );
  return 'sent';
}

interface MediaRow {
  id: string;
  spot_id: string;
  owner_id: string | null;
  file_path: string;
  captured_at: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

/** The photo goes up first, then the row; a removed photo sends only its deleted_at (D3: its file may be gone). */
async function sendMedia(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
  io: PhotoIO,
  id: string,
): Promise<Sent> {
  const row = await db.getFirstAsync<MediaRow>(
    `SELECT id, spot_id, owner_id, file_path, captured_at, latitude, longitude, created_at, updated_at, deleted_at
     FROM media WHERE id = ?`,
    id,
  );
  if (!row) return 'sent';
  if (row.owner_id !== uid) return { park: NOT_THIS_ACCOUNT };
  if (row.deleted_at === null) {
    if (!io.exists(row.file_path)) return { park: PHOTO_MISSING };
    const prepared = await io.prepare(row.file_path);
    try {
      await uploadPhoto(client, uid, row, prepared.bytes);
    } finally {
      prepared.cleanup();
    }
  }
  check(
    await client.from('media').upsert({
      id: row.id,
      spot_id: row.spot_id,
      owner_id: row.owner_id,
      storage_path: storagePath(uid, row),
      captured_at: toIso(row.captured_at),
      lat: row.latitude,
      lng: row.longitude,
      uploaded_by: row.owner_id,
      created_at: stamp(row.created_at),
      updated_at: stamp(row.updated_at ?? row.created_at),
      deleted_at: optionalStamp(row.deleted_at),
    }),
  );
  return 'sent';
}

interface HitListRow {
  id: string;
  owner_id: string | null;
  name: string;
  kind: string;
  area_center_lat: number | null;
  area_center_lng: number | null;
  area_radius_m: number | null;
  area_filters_json: string | null;
  area_place: string | null;
  shared: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function areaFilters(json: string | null): unknown {
  if (json === null) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function sendHitList(db: SQLiteDatabase, client: SupabaseClient, uid: string, id: string): Promise<Sent> {
  const row = await db.getFirstAsync<HitListRow>(
    `SELECT id, owner_id, name, kind, area_center_lat, area_center_lng, area_radius_m, area_filters_json, area_place,
            shared, created_at, updated_at, deleted_at FROM hit_lists WHERE id = ?`,
    id,
  );
  if (!row) return 'sent';
  if (row.owner_id !== uid) return { park: NOT_THIS_ACCOUNT };
  check(
    await client.from('hit_lists').upsert({
      id: row.id,
      owner_id: row.owner_id,
      name: row.name,
      kind: row.kind,
      area_center_lat: row.area_center_lat,
      area_center_lng: row.area_center_lng,
      area_radius_m: row.area_radius_m,
      area_filters: areaFilters(row.area_filters_json),
      area_place: row.area_place,
      shared: row.shared === 1,
      created_at: stamp(row.created_at),
      updated_at: stamp(row.updated_at),
      deleted_at: optionalStamp(row.deleted_at),
    }),
  );
  return 'sent';
}

/**
 * A membership has no update policy: an upsert is "insert unless it is there" (ON CONFLICT DO NOTHING); a delete
 * that matches no row is done too.
 */
async function sendMembership(db: SQLiteDatabase, client: SupabaseClient, uid: string, row: OutboxRow): Promise<Sent> {
  const slash = row.entity_id.indexOf('/');
  const listId = row.entity_id.slice(0, slash);
  const spotId = row.entity_id.slice(slash + 1);
  if (row.op === 'delete') {
    check(await client.from('hit_list_spots').delete().eq('list_id', listId).eq('spot_id', spotId));
    return 'sent';
  }
  const member = await db.getFirstAsync<{ added_at: string }>(
    'SELECT added_at FROM hit_list_spots WHERE list_id = ? AND spot_id = ?',
    listId,
    spotId,
  );
  if (!member) return 'sent';
  check(
    await client
      .from('hit_list_spots')
      .upsert(
        { list_id: listId, spot_id: spotId, added_by: uid, added_at: stamp(member.added_at) },
        { onConflict: 'list_id,spot_id', ignoreDuplicates: true },
      ),
  );
  return 'sent';
}
