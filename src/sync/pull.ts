import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';
import { replaceMembers } from '@/src/db/hit-lists';
import { getProfiles, upsertProfiles } from '@/src/db/profiles';
import { getCursor, setCursor, type SyncTable } from '@/src/db/sync';
import type { ListMember, MemberRole, MemberStatus } from '@/src/types';
import { maySync, signedInAs } from './account';
import { errorMessage } from './errors';
import { readProfiles } from './friends';
import { cachedPhotoPath } from './photos';
import { forgetList, removeUnheldForeignSpots } from './shared-rows';
import { toIso } from './time';

/**
 * Pull (docs/plans/2026-10-22-s5-sync.md, "Pull"; shared lists S8, docs/plans/2026-10-22-s8-shared-lists.md "Pull"):
 * reads the members mirror in full, brings down every row the rider can read whose server `rev` is past the table's
 * cursor, in FK order, fills each shared list with the readable rows not held whatever their rev, then reconciles what
 * `rev` can't show (memberships the server deleted for real, lists the rider is no longer in, others' spots the rider
 * can no longer read, others' photos deleted on the server).
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
/** Rows per page of a full read (the members mirror, a shared list's fill): PostgREST's cap. */
const FULL_READ_PAGE = 1000;
const TABLES: readonly SyncTable[] = ['spots', 'media', 'hit_lists', 'hit_list_spots'];

export interface PullResult {
  /** A local row was written or removed: the stores need a reload. */
  changed: boolean;
  /** A table could not be read (offline, a server error): the phone is not up to date. A row that waits is not this. */
  failed?: true;
  /** Others' spots this pull removed (S8): the engine deletes their cached photo folders. */
  removedSpotIds?: string[];
  /** The `cache/photos/…` files of others' photo rows this pull removed. */
  removedPhotoPaths?: string[];
}

type ServerRow = Record<string, unknown>;
type Values = Record<string, SQLiteBindValue>;

export async function pull(db: SQLiteDatabase, client: SupabaseClient, uid: string): Promise<PullResult> {
  if (!(await maySync(db, client, uid))) return { changed: false };
  let changed = false;
  let failed = false;
  const members = await pullMembers(db, client, uid);
  if (members) changed = members.changed;
  else failed = true;
  const context: TableContext = { uid, joined: members?.joined ?? null, complete: true };
  for (const table of TABLES) {
    const result = await pullTable(db, client, table, context);
    changed = result.changed || changed;
    failed = result.failed || failed;
    context.complete = context.complete && result.complete;
  }
  const fill = await fillSharedLists(db, client, uid);
  changed = fill.changed || changed;
  failed = fill.failed || failed;
  changed = (await mirrorProfiles(db, client, uid)) || changed;
  changed = (await reconcileMemberships(db, client, uid, fill.read)) || changed;
  const removedSpotIds = members ? await reconcileLists(db, client, uid, members.joined) : [];
  removedSpotIds.push(...(await reconcileReadableSpots(db, client, uid)));
  const removedPhotoPaths = await reconcileForeignPhotos(db, client, uid);
  changed = changed || removedSpotIds.length > 0 || removedPhotoPaths.length > 0;

  const result: PullResult = { changed };
  if (failed) result.failed = true;
  if (removedSpotIds.length > 0) result.removedSpotIds = removedSpotIds;
  if (removedPhotoPaths.length > 0) result.removedPhotoPaths = removedPhotoPaths;
  return result;
}

type Page = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/** Every row `ask` pages through (`range(from, to)`, both inclusive) until a short page; null when a page failed. */
async function readAll(ask: (from: number, to: number) => Page, what: string): Promise<ServerRow[] | null> {
  const rows: ServerRow[] = [];
  for (let from = 0; ; from += FULL_READ_PAGE) {
    const { data, error } = await ask(from, from + FULL_READ_PAGE - 1);
    if (error) {
      console.warn(`[sync] pull: could not read ${what}:`, error.message);
      return null;
    }
    const page = (data ?? []) as ServerRow[];
    rows.push(...page);
    if (page.length < FULL_READ_PAGE) return rows;
  }
}

/** A server hit_list_members row as the mirror holds it. */
export function memberFromServer(row: ServerRow): ListMember {
  const joined = stamp(row.joined_at);
  return {
    list_id: String(row.list_id),
    user_id: String(row.user_id),
    role: row.role as MemberRole,
    status: row.status as MemberStatus,
    ...(joined !== null ? { joined_at: joined } : {}),
  };
}

/**
 * The members mirror (S8) is a full read: the server deletes member rows for real (Leave, Remove, Decline, Stop
 * sharing), so `rev` can't show them. RLS returns every row of the rider's lists, the rider's own rows and the rows of
 * lists they joined. Null when a page failed or the session ended meanwhile (an anonymous read sees no rows): then the
 * mirror stays and nothing that depends on it is removed. Resolves the lists the rider is a 'member' of.
 */
async function pullMembers(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
): Promise<{ changed: boolean; joined: Set<string> } | null> {
  const rows = await readAll(
    (from, to) =>
      client
        .from('hit_list_members')
        .select('list_id, user_id, role, status, joined_at')
        .order('list_id')
        .order('user_id')
        .range(from, to),
    'list members',
  );
  if (rows === null || !(await signedInAs(client, uid))) return null;
  const members = rows.map(memberFromServer);
  const changed = await replaceMembers(db, members);
  const joined = new Set(members.filter((m) => m.user_id === uid && m.status === 'member').map((m) => m.list_id));
  return { changed, joined };
}

/**
 * The names of the members and the owners of others' lists (D72), so the member strip and '@ana's spot' show offline.
 * A failed read only warns: the names come next pull.
 */
async function mirrorProfiles(db: SQLiteDatabase, client: SupabaseClient, uid: string): Promise<boolean> {
  const ids = (
    await db.getAllAsync<{ id: string }>(
      `SELECT user_id AS id FROM hit_list_members WHERE user_id <> ?
       UNION SELECT owner_id FROM hit_lists WHERE owner_id IS NOT NULL AND owner_id <> ?
       ORDER BY 1`,
      uid,
      uid,
    )
  ).map((r) => r.id);
  if (ids.length === 0) return false;
  try {
    const before = await getProfiles(db, ids);
    const profiles = await readProfiles(client, ids);
    await upsertProfiles(db, profiles);
    const after = await getProfiles(db, ids);
    return ids.some(
      (id) => before[id]?.username !== after[id]?.username || before[id]?.display_name !== after[id]?.display_name,
    );
  } catch (err) {
    console.warn('[sync] pull: could not read the members’ names:', errorMessage(err));
    return false;
  }
}


interface TableContext {
  uid: string;
  /** The lists the members read says the rider joined; null when it failed. */
  joined: Set<string> | null;
  /** Every earlier table was read to its end: a parent missing now isn't coming by rev in this pull. */
  complete: boolean;
}

/**
 * What a pulled row needs before it can be written (S8). Someone else's list only once the rider joined it (an
 * invitation's row waits for Join: the fill fetches it then, whatever its rev); with the members read failed the table
 * stops there, so a stale mirror never skips a list for good. A membership whose list or spot isn't held, or someone
 * else's photo whose spot isn't, is skipped once the earlier tables are complete (the fill brings what the rider may
 * read); while one of them stopped, it stops this table too, as an own photo whose spot isn't here always does.
 */
async function verdict(db: SQLiteDatabase, table: SyncTable, row: ServerRow, ctx: TableContext): Promise<'apply' | 'skip' | 'stop'> {
  const held = async (t: 'spots' | 'hit_lists', id: unknown) =>
    (await db.getFirstAsync(`SELECT 1 FROM ${t} WHERE id = ?`, text(id))) !== null;
  const foreign = row.owner_id !== undefined && row.owner_id !== null && row.owner_id !== ctx.uid;
  switch (table) {
    case 'hit_lists':
      if (!foreign) return 'apply';
      if (ctx.joined === null) return 'stop';
      return ctx.joined.has(String(row.id)) ? 'apply' : 'skip';
    case 'media':
      if (!foreign || (await held('spots', row.spot_id))) return 'apply';
      return ctx.complete ? 'skip' : 'stop';
    case 'hit_list_spots':
      if ((await held('hit_lists', row.list_id)) && (await held('spots', row.spot_id))) return 'apply';
      return ctx.complete ? 'skip' : 'stop';
    default:
      return 'apply';
  }
}

/**
 * Pages `rev > cursor - REV_OVERLAP` in rev order. The table stops at the first row that can't be written (a photo
 * whose spot isn't here yet): the cursor stays at the last row applied, so that row and the ones after it come again.
 * `complete` is false when the table failed or stopped.
 */
async function pullTable(
  db: SQLiteDatabase,
  client: SupabaseClient,
  table: SyncTable,
  ctx: TableContext,
): Promise<{ changed: boolean; failed: boolean; complete: boolean }> {
  const cursor = await getCursor(db, table);
  let after = Math.max(0, cursor - REV_OVERLAP);
  let highest = cursor;
  let changed = false;
  let failed = false;
  let complete = false;
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
        const next = await verdict(db, table, row, ctx);
        if (next === 'stop') throw new Error('its parent is not here yet');
        if (next === 'apply' && (await applyRow(db, table, row, ctx.uid))) changed = true;
      } catch (err) {
        console.warn(`[sync] pull ${table}: a row at rev ${String(row.rev)} waits for the next sync:`, errorMessage(err));
        break pages;
      }
      highest = Math.max(highest, Number(row.rev));
    }
    if (rows.length < PULL_PAGE) {
      complete = true;
      break;
    }
    after = Number(rows[rows.length - 1].rev);
  }
  if (highest > cursor) await setCursor(db, table, highest);
  return { changed, failed, complete };
}

const text = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));
const num = (value: unknown): number | null => (typeof value === 'number' ? value : null);
/** Every timestamp from the server is stored as the app writes them (`…Z`); one toIso can't read stays as sent. */
const stamp = (value: unknown): string | null => {
  const raw = text(value);
  return raw === null ? null : (toIso(raw) ?? raw);
};

function applyRow(db: SQLiteDatabase, table: SyncTable, row: ServerRow, uid: string): Promise<boolean> {
  switch (table) {
    case 'spots':
      return applyOwned(db, table, row, spotValues(row));
    case 'media': {
      // a pulled photo's file comes later (downloadMissingPhotos; someone else's lazily into the cache, never
      // Paths.document, §3.4); a local row keeps its own file_path
      const spotId = String(text(row.spot_id));
      const mediaId = String(text(row.id));
      const filePath =
        text(row.owner_id) === uid ? `photos/${spotId}/${mediaId}.jpg` : cachedPhotoPath(spotId, mediaId);
      return applyOwned(db, table, row, mediaValues(row), { file_path: filePath });
    }
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

/**
 * Writes a hit_lists row the server returned (share_list, the re-read after stop_sharing) the way a pull would: with
 * the server's rev, so the outbox trigger queues nothing (S8, src/sync/lists.ts). Resolves whether it changed the row.
 */
export function applyListRow(db: SQLiteDatabase, row: ServerRow): Promise<boolean> {
  return applyOwned(db, 'hit_lists', row, listValues(row));
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

/**
 * The per-list fill (S8; S5's "Left for S8"): rows the rider may read but doesn't hold, whatever their rev (a list
 * joined after its rows were pulled past, an old spot added to a shared list, a member's spot in the rider's own
 * list). First the joined lists not held, by id; then for every live shared list held (the rider's, or one they
 * joined): a manual list's memberships in full, a friend's area list's readable spots of its owner. Spots not held
 * come by id with their photos, then the memberships. Resolves the lists whose memberships were read to the end
 * (`read`: their rows are the truth for reconcileMemberships); a list whose read was cut off is neither filled nor
 * reconciled.
 */
async function fillSharedLists(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
): Promise<{ changed: boolean; failed: boolean; read: Map<string, Set<string>> }> {
  let changed = false;
  let failed = false;
  const read = new Map<string, Set<string>>();
  const warnRow = (what: string, err: unknown) =>
    console.warn(`[sync] pull: ${what} waits for the next sync:`, errorMessage(err));

  const missingLists = (
    await db.getAllAsync<{ id: string }>(
      `SELECT list_id AS id FROM hit_list_members
       WHERE user_id = ? AND status = 'member' AND list_id NOT IN (SELECT id FROM hit_lists) ORDER BY list_id`,
      uid,
    )
  ).map((r) => r.id);
  for (const chunk of chunks(missingLists, IDS_PER_QUERY)) {
    const { data, error } = await client.from('hit_lists').select('*').in('id', chunk);
    if (error) {
      console.warn('[sync] pull: could not read the joined lists:', error.message);
      failed = true;
      break;
    }
    for (const row of (data ?? []) as ServerRow[]) {
      // a list its owner deleted keeps its member rows on the server: fetching it back would loop with reconcileLists
      if (text(row.owner_id) === uid || (row.deleted_at !== null && row.deleted_at !== undefined)) continue;
      try {
        changed = (await applyOwned(db, 'hit_lists', row, listValues(row))) || changed;
      } catch (err) {
        warnRow(`list ${text(row.id)}`, err);
      }
    }
  }

  const lists = await db.getAllAsync<{ id: string; kind: string; owner_id: string }>(
    `SELECT l.id, l.kind, l.owner_id FROM hit_lists l
     WHERE l.shared = 1 AND l.deleted_at IS NULL AND l.owner_id IS NOT NULL
       AND (l.owner_id = ? OR EXISTS (
         SELECT 1 FROM hit_list_members m WHERE m.list_id = l.id AND m.user_id = ? AND m.status = 'member'))
     ORDER BY l.id`,
    uid,
    uid,
  );
  const wanted = new Set<string>();
  const memberships: ServerRow[] = [];
  for (const list of lists) {
    if (list.kind === 'manual') {
      const rows = await readAll(
        (from, to) => client.from('hit_list_spots').select('*').eq('list_id', list.id).order('spot_id').range(from, to),
        `the spots of list ${list.id}`,
      );
      if (rows === null) {
        failed = true;
        continue;
      }
      read.set(list.id, new Set(rows.map((r) => String(r.spot_id))));
      memberships.push(...rows);
      for (const row of rows) wanted.add(String(row.spot_id));
    } else if (list.owner_id !== uid) {
      const rows = await readAll(
        (from, to) => client.from('spots').select('id').eq('owner_id', list.owner_id).order('id').range(from, to),
        `the spots of area list ${list.id}`,
      );
      if (rows === null) {
        failed = true;
        continue;
      }
      for (const row of rows) wanted.add(String(row.id));
    }
  }

  const held = new Set(
    (
      await db.getAllAsync<{ id: string }>(
        'SELECT id FROM spots WHERE id IN (SELECT value FROM json_each(?))',
        JSON.stringify([...wanted]),
      )
    ).map((r) => r.id),
  );
  const missingSpots = [...wanted].filter((id) => !held.has(id)).sort();
  for (const chunk of chunks(missingSpots, IDS_PER_QUERY)) {
    const spots = await client.from('spots').select('*').in('id', chunk);
    // 100 spots can hold more photos than one response (1000 rows): paged
    const media = spots.error
      ? null
      : await readAll(
          (from, to) => client.from('media').select('*').in('spot_id', chunk).order('id').range(from, to),
          'the shared photos',
        );
    if (spots.error || !media) {
      if (spots.error) console.warn('[sync] pull: could not read the shared spots:', spots.error.message);
      failed = true;
      break;
    }
    for (const row of (spots.data ?? []) as ServerRow[]) {
      try {
        changed = (await applyOwned(db, 'spots', row, spotValues(row))) || changed;
      } catch (err) {
        warnRow(`spot ${text(row.id)}`, err);
      }
    }
    for (const row of media) {
      try {
        changed = (await applyRow(db, 'media', row, uid)) || changed;
      } catch (err) {
        warnRow(`photo ${text(row.id)}`, err);
      }
    }
  }
  for (const row of memberships) {
    // a row whose spot the server won't return (deleted, or a stray row) waits quietly: nothing to hold
    if ((await db.getFirstAsync('SELECT 1 FROM spots WHERE id = ?', text(row.spot_id))) === null) continue;
    try {
      changed = (await applyMembership(db, row)) || changed;
    } catch (err) {
      // its spot couldn't be fetched (yet): the next pull asks again
      warnRow(`membership ${text(row.list_id)}/${text(row.spot_id)}`, err);
    }
  }
  return { changed, failed, read };
}

/**
 * The server deletes memberships for real, so `rev` can't show it. A local membership of a live list with an owner,
 * whose spot is synced, that the server no longer has is removed here, marked `rev = -1` first so the delete
 * trigger queues nothing (a queued delete would go to the server). The truth for a shared list is its fill read; for
 * the rider's private lists one `in` query per list. In the rider's own list any outbox row keeps a membership (it
 * still has something to tell the server); in someone else's only a waiting one does: a parked row (a view-only add
 * the server refused, 42501) goes with the membership once the read shows the server hasn't got it. A phone-only list
 * or spot is never asked about; any failed request, or the session ending (an anonymous read sees no memberships),
 * removes nothing.
 */
async function reconcileMemberships(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
  read: Map<string, Set<string>>,
): Promise<boolean> {
  const local = await db.getAllAsync<{ list_id: string; spot_id: string; list_owner: string; outbox: number; waiting: number }>(
    `SELECT m.list_id, m.spot_id, l.owner_id AS list_owner,
       EXISTS (SELECT 1 FROM sync_outbox o WHERE ${MEMBERSHIP_ROW}) AS outbox,
       EXISTS (SELECT 1 FROM sync_outbox o WHERE ${MEMBERSHIP_ROW} AND o.parked = 0) AS waiting
     FROM hit_list_spots m
     JOIN hit_lists l ON l.id = m.list_id
     JOIN spots s ON s.id = m.spot_id
     WHERE l.owner_id IS NOT NULL AND l.deleted_at IS NULL AND s.owner_id IS NOT NULL
     ORDER BY m.list_id, m.spot_id`,
  );
  const gone: string[] = [];
  const asked = new Map<string, string[]>();
  for (const row of local) {
    const mine = row.list_owner === uid;
    if (mine ? row.outbox === 1 : row.waiting === 1) continue;
    const truth = read.get(row.list_id);
    if (truth) {
      if (!truth.has(row.spot_id)) gone.push(`${row.list_id}/${row.spot_id}`);
    } else if (mine) {
      asked.set(row.list_id, [...(asked.get(row.list_id) ?? []), row.spot_id]);
    }
  }
  for (const [listId, spotIds] of asked) {
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

  // checked again in SQL: a change saved while the reads ran keeps its membership
  const ids = JSON.stringify(gone);
  const keeps = `EXISTS (SELECT 1 FROM sync_outbox o WHERE ${MEMBERSHIP_ROW}
    AND (o.parked = 0 OR (SELECT owner_id FROM hit_lists WHERE id = m.list_id) = ?))`;
  await db.runAsync(
    `UPDATE hit_list_spots AS m SET rev = -1
     WHERE m.list_id || '/' || m.spot_id IN (SELECT value FROM json_each(?)) AND NOT ${keeps}`,
    ids,
    uid,
  );
  await db.runAsync(
    `DELETE FROM sync_outbox WHERE entity = 'hit_list_spot' AND parked = 1 AND entity_id IN (
       SELECT list_id || '/' || spot_id FROM hit_list_spots WHERE rev = -1
         AND list_id || '/' || spot_id IN (SELECT value FROM json_each(?)))`,
    ids,
  );
  const { changes } = await db.runAsync(
    `DELETE FROM hit_list_spots WHERE rev = -1 AND list_id || '/' || spot_id IN (SELECT value FROM json_each(?))`,
    ids,
  );
  return changes > 0;
}

/** The outbox row `o` is membership `m`'s. */
const MEMBERSHIP_ROW = `o.entity = 'hit_list_spot' AND o.entity_id = m.list_id || '/' || m.spot_id`;

/**
 * Others' lists the rider is no longer in (left, removed, declined, unshared: the mirror has no 'member' row of
 * theirs) or that their owner deleted leave the phone with their memberships and mirror rows, then the others' spots
 * no held list shows any more. Runs only after a members read that succeeded, and not once the session ended.
 * Resolves the spots removed.
 */
async function reconcileLists(
  db: SQLiteDatabase,
  client: SupabaseClient,
  uid: string,
  joined: Set<string>,
): Promise<string[]> {
  const lists = await db.getAllAsync<{ id: string; deleted_at: string | null }>(
    'SELECT id, deleted_at FROM hit_lists WHERE owner_id IS NOT NULL AND owner_id <> ? ORDER BY id',
    uid,
  );
  const gone = lists.filter((l) => l.deleted_at !== null || !joined.has(l.id)).map((l) => l.id);
  if (gone.length === 0 || !(await signedInAs(client, uid))) return [];
  for (const id of gone) await forgetList(db, id);
  return removeUnheldForeignSpots(db, uid);
}

/**
 * Others' spots (S8) the rider can no longer read (left the list, unfriended, unshared) are removed from the phone
 * with their photos' rows and memberships (spec §3.4 "removes local copies"). Only rows owned by someone else: never
 * the rider's own, never a phone-only (NULL) row. Removing them queues nothing: spots and media have no delete
 * trigger, and their memberships are marked `rev = -1` first (the owner removing a member's spot from their own list
 * would queue, migration 8). Any failed request, or the session ending, removes nothing. Resolves the spots removed.
 */
async function reconcileReadableSpots(db: SQLiteDatabase, client: SupabaseClient, uid: string): Promise<string[]> {
  const foreign = (
    await db.getAllAsync<{ id: string }>(
      'SELECT id FROM spots WHERE owner_id IS NOT NULL AND owner_id <> ? ORDER BY id',
      uid,
    )
  ).map((r) => r.id);
  if (foreign.length === 0) return [];

  const found = await readable(
    (chunk) => client.from('spots').select('id').in('id', chunk),
    'id',
    foreign,
    'readable spots',
  );
  if (found === null) return [];
  const gone = foreign.filter((id) => !found.has(id));
  if (gone.length === 0 || !(await signedInAs(client, uid))) return [];

  const ids = JSON.stringify(gone);
  const theirs = `SELECT id FROM spots WHERE id IN (SELECT value FROM json_each(?)) AND owner_id IS NOT NULL AND owner_id <> ?`;
  await db.runAsync(`UPDATE hit_list_spots SET rev = -1 WHERE spot_id IN (${theirs})`, ids, uid);
  await db.runAsync(`DELETE FROM hit_list_spots WHERE spot_id IN (${theirs})`, ids, uid);
  await db.runAsync(`DELETE FROM media WHERE spot_id IN (${theirs})`, ids, uid);
  await db.runAsync(`DELETE FROM spots WHERE id IN (${theirs})`, ids, uid);
  return gone;
}

/**
 * A photo its owner deleted never reaches a member by rev (the server hides deleted photo rows from others), so the
 * photo rows of others' spots the server no longer returns go here, and a primary_photo_id naming one is cleared (a
 * pull write of someone else's row: nothing queues; their next spot pull sets it anyway). Only after every read
 * succeeded and with the session live. Resolves the removed rows' cache paths.
 */
async function reconcileForeignPhotos(db: SQLiteDatabase, client: SupabaseClient, uid: string): Promise<string[]> {
  const local = await db.getAllAsync<{ id: string; spot_id: string; file_path: string }>(
    `SELECT m.id, m.spot_id, m.file_path FROM media m JOIN spots s ON s.id = m.spot_id
     WHERE s.owner_id IS NOT NULL AND s.owner_id <> ? AND m.deleted_at IS NULL
     ORDER BY m.id`,
    uid,
  );
  if (local.length === 0) return [];
  // paged per chunk: a short answer under the 1000-row cap would read as photos deleted
  const found = new Set<string>();
  for (const chunk of chunks([...new Set(local.map((m) => m.spot_id))].sort(), IDS_PER_QUERY)) {
    const rows = await readAll(
      (from, to) => client.from('media').select('id').in('spot_id', chunk).order('id').range(from, to),
      'the shared photos, nothing removed',
    );
    if (rows === null) return [];
    for (const row of rows) found.add(String(row.id));
  }
  const gone = local.filter((m) => !found.has(m.id));
  if (gone.length === 0 || !(await signedInAs(client, uid))) return [];

  const ids = JSON.stringify(gone.map((m) => m.id));
  await db.runAsync(
    `UPDATE spots SET primary_photo_id = NULL
     WHERE primary_photo_id IN (SELECT value FROM json_each(?)) AND owner_id IS NOT NULL AND owner_id <> ?`,
    ids,
    uid,
  );
  await db.runAsync('DELETE FROM media WHERE id IN (SELECT value FROM json_each(?))', ids);
  return gone.map((m) => m.file_path);
}
