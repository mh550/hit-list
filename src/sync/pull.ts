import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';
import { getCursor, setCursor, type SyncTable } from '@/src/db/sync';
import { maySync, signedInAs } from './account';
import { errorMessage } from './errors';
import { toIso } from './time';

/**
 * Pull (docs/plans/2026-10-22-s5-sync.md, "Pull"): brings down every row the rider can read whose server `rev` is
 * past the table's cursor, in FK order, then reconciles what `rev` can't show (memberships the server deleted for real,
 * others' spots the rider can no longer read).
 *
 * Every write here sets the server's `rev`, so the outbox triggers (which fire only when `rev` is unchanged) queue
 * nothing: a pulled row never echoes back. A row is written only when the server's `updated_at` is at least the
 * local one (an unpushed local edit wins; its outbox row still pushes it). Nothing here runs in a transaction.
 */

/** Rows per page; PostgREST answers at most 1000. */
export const PULL_PAGE = 500;
/**
 * The server's `bump_rev` takes `nextval` inside the writer's transaction, so rev 100 can commit after rev 101 was
 * pulled. Each pull re-reads this many revs below the cursor; a row applied twice is a no-op (`rev` guard).
 * `sync_rev` is one sequence for every table and every rider, so this is a window of revs handed out anywhere, not
 * of this rider's rows: a transaction that stays open while more than 200 others commit can still be missed.
 */
export const REV_OVERLAP = 200;
/** Ids per `in.(…)` filter: keeps the request URL short. */
const IDS_PER_QUERY = 100;
const TABLES: readonly SyncTable[] = ['spots', 'media', 'hit_lists', 'hit_list_spots'];

export interface PullResult {
  /** A local row was written or removed: the stores need a reload. */
  changed: boolean;
  /** A table could not be read (offline, a server error): the phone is not up to date. A row that waits is not this. */
  failed?: true;
}

type ServerRow = Record<string, unknown>;
type Values = Record<string, SQLiteBindValue>;

export async function pull(db: SQLiteDatabase, client: SupabaseClient, uid: string): Promise<PullResult> {
  if (!(await maySync(db, client, uid))) return { changed: false };
  let changed = false;
  let failed = false;
  for (const table of TABLES) {
    const result = await pullTable(db, client, table);
    changed = result.changed || changed;
    failed = result.failed || failed;
  }
  changed = (await reconcileMemberships(db, client, uid)) || changed;
  changed = (await reconcileReadableSpots(db, client, uid)) || changed;
  return failed ? { changed, failed } : { changed };
}


/**
 * Pages `rev > cursor - REV_OVERLAP` in rev order. The table stops at the first row that can't be written (a photo
 * whose spot isn't here yet): the cursor stays at the last row applied, so that row and the ones after it come again.
 */
async function pullTable(
  db: SQLiteDatabase,
  client: SupabaseClient,
  table: SyncTable,
): Promise<{ changed: boolean; failed: boolean }> {
  const cursor = await getCursor(db, table);
  let after = Math.max(0, cursor - REV_OVERLAP);
  let highest = cursor;
  let changed = false;
  let failed = false;
  pages: for (;;) {
    const { data, error } = await client.from(table).select('*').gt('rev', after).order('rev').limit(PULL_PAGE);
    if (error) {
      console.warn(`[sync] pull ${table} failed:`, error.message);
      failed = true;
      break;
    }
    const rows = (data ?? []) as ServerRow[];
    for (const row of rows) {
      try {
        if (await applyRow(db, table, row)) changed = true;
      } catch (err) {
        console.warn(`[sync] pull ${table}: a row at rev ${String(row.rev)} waits for the next sync:`, errorMessage(err));
        break pages;
      }
      highest = Math.max(highest, Number(row.rev));
    }
    if (rows.length < PULL_PAGE) break;
    after = Number(rows[rows.length - 1].rev);
  }
  if (highest > cursor) await setCursor(db, table, highest);
  return { changed, failed };
}

const text = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));
const num = (value: unknown): number | null => (typeof value === 'number' ? value : null);
/** Every timestamp from the server is stored as the app writes them (`…Z`); one toIso can't read stays as sent. */
const stamp = (value: unknown): string | null => {
  const raw = text(value);
  return raw === null ? null : (toIso(raw) ?? raw);
};

function applyRow(db: SQLiteDatabase, table: SyncTable, row: ServerRow): Promise<boolean> {
  switch (table) {
    case 'spots':
      return applyOwned(db, table, row, spotValues(row));
    case 'media':
      // a pulled photo's file comes later (downloadMissingPhotos); a local row keeps its own file_path
      return applyOwned(db, table, row, mediaValues(row), { file_path: `photos/${text(row.spot_id)}/${text(row.id)}.jpg` });
    case 'hit_lists':
      return applyOwned(db, table, row, listValues(row));
    case 'hit_list_spots':
      return applyMembership(db, row);
  }
}

/**
 * Server → local columns (push maps the other way). `legacy_json` never left the phone, so a pull never sets it. A
 * saved send's two columns (S7) come only when the server row has them, so a server without the S7 migration never
 * clears them.
 */
function spotValues(row: ServerRow): Values {
  const sendColumns: Values = {};
  if ('copied_from_send' in row) sendColumns.copied_from_send = text(row.copied_from_send);
  if ('from_username' in row) sendColumns.from_username = text(row.from_username);
  return {
    owner_id: text(row.owner_id),
    name: text(row.name),
    generated_name: text(row.generated_name),
    latitude: Number(row.lat),
    longitude: Number(row.lng),
    feature_types_json: JSON.stringify(Array.isArray(row.feature_types) ? row.feature_types : []),
    stopped: row.stopped === true ? 1 : 0,
    // 0 (None) is a rating; only null is unset
    natural_speed: num(row.natural_speed),
    notes: text(row.notes),
    primary_photo_id: text(row.primary_photo_id),
    ...sendColumns,
    created_at: stamp(row.created_at),
    updated_at: stamp(row.updated_at),
    deleted_at: stamp(row.deleted_at),
  };
}

function mediaValues(row: ServerRow): Values {
  return {
    spot_id: text(row.spot_id),
    owner_id: text(row.owner_id),
    captured_at: stamp(row.captured_at),
    latitude: num(row.lat),
    longitude: num(row.lng),
    uploaded_by: text(row.uploaded_by),
    created_at: stamp(row.created_at),
    updated_at: stamp(row.updated_at),
    deleted_at: stamp(row.deleted_at),
  };
}

function listValues(row: ServerRow): Values {
  return {
    owner_id: text(row.owner_id),
    name: text(row.name),
    kind: text(row.kind),
    area_center_lat: num(row.area_center_lat),
    area_center_lng: num(row.area_center_lng),
    area_radius_m: num(row.area_radius_m),
    area_filters_json: row.area_filters === null || row.area_filters === undefined ? null : JSON.stringify(row.area_filters),
    area_place: text(row.area_place),
    shared: row.shared === true ? 1 : 0,
    created_at: stamp(row.created_at),
    updated_at: stamp(row.updated_at),
    deleted_at: stamp(row.deleted_at),
  };
}

/** The incoming row is older than the local one. An unreadable incoming time never overwrites; an unreadable local one does. */
function isOlder(incoming: SQLiteBindValue, local: SQLiteBindValue): boolean {
  const at = (value: SQLiteBindValue) => Date.parse(toIso(typeof value === 'string' ? value : null) ?? '');
  const theirs = at(incoming);
  const mine = at(local);
  if (Number.isNaN(theirs)) return true;
  return !Number.isNaN(mine) && theirs < mine;
}

/**
 * Inserts a row this phone doesn't have, or updates one when the server's rev is newer than the stored one and its
 * updated_at is not older (equal applies: the echo of this phone's own push only stores the rev). Both guards sit in
 * the UPDATE itself, so an edit the rider saves while the pull awaits is never overwritten (julianday reads `…Z` and
 * SQLite's `YYYY-MM-DD HH:MM:SS`). Never `INSERT OR REPLACE`: replacing a spot would cascade-delete its photos and
 * memberships.
 */
const OUTBOX_ENTITY = { spots: 'spot', media: 'media', hit_lists: 'hit_list' } as const;

async function applyOwned(
  db: SQLiteDatabase,
  table: 'spots' | 'media' | 'hit_lists',
  row: ServerRow,
  values: Values,
  insertOnly: Values = {},
): Promise<boolean> {
  const id = text(row.id);
  const rev = Number(row.rev);
  const columns = Object.keys(values);
  const local = await db.getFirstAsync<Values>(`SELECT ${columns.join(', ')}, rev FROM ${table} WHERE id = ?`, id);
  if (!local) {
    const insert: Values = { id, ...values, ...insertOnly, rev };
    const names = Object.keys(insert);
    await db.runAsync(
      `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
      ...Object.values(insert),
    );
    return true;
  }
  if (typeof local.rev === 'number' && local.rev >= rev) return false;
  if (isOlder(values.updated_at, local.updated_at)) return false;
  // A tie goes to the server, unless a local change still waits to push: setTown keeps updated_at, so a town stored
  // after the push ties with that push's echo and must survive it (the push then sends it at the same stamp).
  const { changes } = await db.runAsync(
    `UPDATE ${table} SET ${columns.map((c) => `${c} = ?`).join(', ')}, rev = ?
     WHERE id = ? AND (rev IS NULL OR rev < ?)
       AND (julianday(updated_at) IS NULL OR julianday(updated_at) < julianday(?)
         OR (julianday(updated_at) = julianday(?) AND NOT EXISTS (
           SELECT 1 FROM sync_outbox WHERE entity = ? AND entity_id = ? AND parked = 0)))`,
    ...Object.values(values),
    rev,
    id,
    rev,
    values.updated_at,
    values.updated_at,
    OUTBOX_ENTITY[table],
    id,
  );
  return changes > 0 && columns.some((c) => local[c] !== values[c]);
}

/**
 * A membership is insert-only (the server has no update). One the rider removed and hasn't pushed yet stays removed.
 * A list or spot that isn't here fails the foreign key and stops the table.
 */
async function applyMembership(db: SQLiteDatabase, row: ServerRow): Promise<boolean> {
  const listId = text(row.list_id);
  const spotId = text(row.spot_id);
  const { changes } = await db.runAsync(
    `INSERT OR IGNORE INTO hit_list_spots (list_id, spot_id, added_by, added_at, rev)
     SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (
       SELECT 1 FROM sync_outbox
       WHERE entity = 'hit_list_spot' AND entity_id = ? AND op = 'delete' AND parked = 0
     )`,
    listId,
    spotId,
    text(row.added_by),
    stamp(row.added_at),
    Number(row.rev),
    `${listId}/${spotId}`,
  );
  return changes > 0;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Which of `ids` the server lets the rider read, or null when any request failed (then nothing is removed). */
async function readable(
  ask: (chunk: string[]) => PromiseLike<{ data: ServerRow[] | null; error: { message: string } | null }>,
  column: string,
  ids: string[],
  what: string,
): Promise<Set<string> | null> {
  const found = new Set<string>();
  for (const chunk of chunks(ids, IDS_PER_QUERY)) {
    const { data, error } = await ask(chunk);
    if (error) {
      console.warn(`[sync] pull: could not check ${what}, nothing removed:`, error.message);
      return null;
    }
    for (const row of data ?? []) found.add(String(row[column]));
  }
  return found;
}

/** No outbox row of any kind (waiting or parked) for the membership: the phone has nothing left to tell the server. */
const NO_OUTBOX_ROW = `NOT EXISTS (
  SELECT 1 FROM sync_outbox o WHERE o.entity = 'hit_list_spot' AND o.entity_id = m.list_id || '/' || m.spot_id
)`;

/**
 * The server deletes memberships for real, so `rev` can't show it. A membership of the rider's live list whose spot is
 * synced, with no outbox row, that the server no longer has is removed here. It is marked `rev = -1` first so the
 * delete trigger queues nothing (a queued delete would go to the server). A phone-only list or spot is never asked
 * about; any failed request, or the session ending (an anonymous read sees no memberships), removes nothing.
 */
async function reconcileMemberships(db: SQLiteDatabase, client: SupabaseClient, uid: string): Promise<boolean> {
  const local = await db.getAllAsync<{ list_id: string; spot_id: string }>(
    `SELECT m.list_id, m.spot_id FROM hit_list_spots m
     JOIN hit_lists l ON l.id = m.list_id
     JOIN spots s ON s.id = m.spot_id
     WHERE l.owner_id = ? AND l.deleted_at IS NULL AND s.owner_id IS NOT NULL AND ${NO_OUTBOX_ROW}
     ORDER BY m.list_id, m.spot_id`,
    uid,
  );
  const byList = new Map<string, string[]>();
  for (const { list_id, spot_id } of local) byList.set(list_id, [...(byList.get(list_id) ?? []), spot_id]);

  const gone: string[] = [];
  for (const [listId, spotIds] of byList) {
    const found = await readable(
      (chunk) => client.from('hit_list_spots').select('spot_id').eq('list_id', listId).in('spot_id', chunk),
      'spot_id',
      spotIds,
      'list memberships',
    );
    if (found === null) return false;
    for (const spotId of spotIds) if (!found.has(spotId)) gone.push(`${listId}/${spotId}`);
  }
  if (gone.length === 0 || !(await signedInAs(client, uid))) return false;

  const ids = JSON.stringify(gone);
  await db.runAsync(
    `UPDATE hit_list_spots AS m SET rev = -1
     WHERE m.list_id || '/' || m.spot_id IN (SELECT value FROM json_each(?)) AND ${NO_OUTBOX_ROW}`,
    ids,
  );
  const { changes } = await db.runAsync(
    `DELETE FROM hit_list_spots WHERE rev = -1 AND list_id || '/' || spot_id IN (SELECT value FROM json_each(?))`,
    ids,
  );
  return changes > 0;
}

/**
 * Others' spots (S8) the rider can no longer read (left the list, unfriended, unshared) are removed from the phone
 * with their photos' rows and memberships (spec §3.4 "removes local copies"). Only rows owned by someone else: never
 * the rider's own, never a phone-only (NULL) row. Removing them queues nothing: spots and media have no delete
 * trigger, and a membership queues only when its spot is the rider's. Any failed request, or the session ending,
 * removes nothing.
 */
async function reconcileReadableSpots(db: SQLiteDatabase, client: SupabaseClient, uid: string): Promise<boolean> {
  const foreign = (
    await db.getAllAsync<{ id: string }>(
      'SELECT id FROM spots WHERE owner_id IS NOT NULL AND owner_id <> ? ORDER BY id',
      uid,
    )
  ).map((r) => r.id);
  if (foreign.length === 0) return false;

  const found = await readable(
    (chunk) => client.from('spots').select('id').in('id', chunk),
    'id',
    foreign,
    'readable spots',
  );
  if (found === null) return false;
  const gone = foreign.filter((id) => !found.has(id));
  if (gone.length === 0 || !(await signedInAs(client, uid))) return false;

  const ids = JSON.stringify(gone);
  const theirs = `SELECT id FROM spots WHERE id IN (SELECT value FROM json_each(?)) AND owner_id IS NOT NULL AND owner_id <> ?`;
  // rev = -1 first: the owner's delete of a member's spot from their own list would queue a server DELETE (migration 8)
  await db.runAsync(`UPDATE hit_list_spots SET rev = -1 WHERE spot_id IN (${theirs})`, ids, uid);
  await db.runAsync(`DELETE FROM hit_list_spots WHERE spot_id IN (${theirs})`, ids, uid);
  await db.runAsync(`DELETE FROM media WHERE spot_id IN (${theirs})`, ids, uid);
  const { changes } = await db.runAsync(`DELETE FROM spots WHERE id IN (${theirs})`, ids, uid);
  return changes > 0;
}
