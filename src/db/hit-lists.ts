import type { SQLiteDatabase } from 'expo-sqlite';
import type { HitList, HitListKind, HitListMember, HitListUpdate, ListMember, MemberRole, MemberStatus, SpotFilters } from '@/src/types';
import { isObject } from '@/src/utils/is-object';

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
  owner_username?: string | null; // getHitLists only: from the profiles mirror, never stored
}

const HIT_LIST_COLUMNS =
  'id, owner_id, name, kind, area_center_lat, area_center_lng, area_radius_m, area_filters_json, area_place, shared, created_at, updated_at, deleted_at';

/** Only the app writes this column, but one unreadable row must not take every list down with it. */
function parseAreaFilters(row: HitListRow): SpotFilters | undefined {
  if (row.area_filters_json === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(row.area_filters_json);
    if (isObject(parsed) && Array.isArray(parsed.types)) return parsed as unknown as SpotFilters;
  } catch {
    // fall through to the warning
  }
  console.warn(`[hit-lists] unreadable area_filters_json on list ${row.id}; reading it as no filters`);
  return undefined;
}

function rowToHitList(row: HitListRow): HitList {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as HitListKind,
    owner_id: row.owner_id ?? undefined,
    shared: row.shared === 1,
    area_center:
      row.area_center_lat !== null && row.area_center_lng !== null
        ? { latitude: row.area_center_lat, longitude: row.area_center_lng }
        : undefined,
    area_radius_m: row.area_radius_m ?? undefined,
    area_filters: parseAreaFilters(row),
    area_place: row.area_place ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at ?? undefined,
    ...(row.owner_username ? { owner_username: row.owner_username } : {}),
  };
}

export async function insertHitList(db: SQLiteDatabase, list: HitList): Promise<void> {
  await db.runAsync(
    `INSERT INTO hit_lists (${HIT_LIST_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    list.id,
    list.owner_id ?? null,
    list.name,
    list.kind,
    list.area_center?.latitude ?? null,
    list.area_center?.longitude ?? null,
    list.area_radius_m ?? null,
    list.area_filters ? JSON.stringify(list.area_filters) : null,
    list.area_place ?? null,
    list.shared ? 1 : 0,
    list.created_at,
    list.updated_at,
    list.deleted_at ?? null,
  );
}

/**
 * Live lists, oldest first, each with its members from the mirror (S8; a list with none has no `members`) and its
 * owner's @username when the profiles mirror has it.
 */
export async function getHitLists(db: SQLiteDatabase): Promise<HitList[]> {
  const rows = await db.getAllAsync<HitListRow>(
    `SELECT ${HIT_LIST_COLUMNS}, (SELECT username FROM profiles WHERE profiles.id = hit_lists.owner_id) AS owner_username
     FROM hit_lists WHERE deleted_at IS NULL ORDER BY created_at`,
  );
  const members = await db.getAllAsync<MemberRow>(
    `SELECT ${MEMBER_COLUMNS} FROM hit_list_members m LEFT JOIN profiles p ON p.id = m.user_id
     WHERE m.list_id IN (SELECT id FROM hit_lists WHERE deleted_at IS NULL)
     ORDER BY ${MEMBER_ORDER}`,
  );
  const byList = new Map<string, HitListMember[]>();
  for (const row of members) {
    const { list_id, joined_at: _joined, ...member } = rowToMember(row);
    byList.set(list_id, [...(byList.get(list_id) ?? []), member]);
  }
  return rows.map((row) => {
    const list = rowToHitList(row);
    const listMembers = byList.get(list.id);
    return listMembers ? { ...list, members: listMembers } : list;
  });
}

/** Writes only the keys given (`area_place: null` clears the place); a deleted list is left alone. */
export async function updateHitList(db: SQLiteDatabase, id: string, updates: HitListUpdate): Promise<void> {
  const setClauses: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    values.push(updates.name);
  }
  if (updates.shared !== undefined) {
    setClauses.push('shared = ?');
    values.push(updates.shared ? 1 : 0);
  }
  if (updates.area_center !== undefined) {
    setClauses.push('area_center_lat = ?', 'area_center_lng = ?');
    values.push(updates.area_center.latitude, updates.area_center.longitude);
  }
  if (updates.area_radius_m !== undefined) {
    setClauses.push('area_radius_m = ?');
    values.push(updates.area_radius_m);
  }
  if (updates.area_filters !== undefined) {
    setClauses.push('area_filters_json = ?');
    values.push(JSON.stringify(updates.area_filters));
  }
  if (updates.area_place !== undefined) {
    setClauses.push('area_place = ?');
    values.push(updates.area_place); // null clears it
  }

  // The caller's stamp wins so the store and DB agree.
  setClauses.push('updated_at = ?');
  values.push(updates.updated_at ?? new Date().toISOString());
  values.push(id);

  await db.runAsync(
    `UPDATE hit_lists SET ${setClauses.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    ...values,
  );
}

/**
 * Marks a list deleted at `at` (ISO 8601 UTC), which also becomes its updated_at; a deleted list keeps its first stamp.
 * Its spots are untouched.
 */
export async function softDeleteHitList(
  db: SQLiteDatabase,
  id: string,
  at: string = new Date().toISOString(),
): Promise<void> {
  await db.runAsync(
    'UPDATE hit_lists SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
    at,
    at,
    id,
  );
}

/**
 * Adds the spots in one statement, so it is all or nothing without a BEGIN: expo-sqlite's withTransactionAsync is a
 * plain BEGIN/COMMIT on the one shared connection, so a second write arriving mid-transaction would fail to BEGIN or
 * be committed/rolled back with it. A spot already in the list keeps its first added_at.
 */
export async function addSpotsToList(
  db: SQLiteDatabase,
  listId: string,
  spotIds: string[],
  addedAt: string = new Date().toISOString(),
  addedBy: string | null = null,
): Promise<void> {
  if (spotIds.length === 0) return;
  await db.runAsync(
    `INSERT OR IGNORE INTO hit_list_spots (list_id, spot_id, added_by, added_at)
     SELECT ?, value, ?, ? FROM json_each(?)`,
    listId,
    addedBy,
    addedAt,
    JSON.stringify(spotIds),
  );
}

export async function removeSpotFromList(db: SQLiteDatabase, listId: string, spotId: string): Promise<void> {
  await db.runAsync('DELETE FROM hit_list_spots WHERE list_id = ? AND spot_id = ?', listId, spotId);
}

/**
 * `{ [spotId]: listId[] }` for every live list, in the order the spot was added to them. A soft-deleted spot keeps
 * its rows; the store's selectors hide it.
 */
export async function getListMemberships(db: SQLiteDatabase): Promise<Record<string, string[]>> {
  const rows = await db.getAllAsync<{ spot_id: string; list_id: string }>(
    `SELECT s.spot_id, s.list_id FROM hit_list_spots s
     JOIN hit_lists l ON l.id = s.list_id
     WHERE l.deleted_at IS NULL
     ORDER BY s.added_at`,
  );
  const memberships: Record<string, string[]> = {};
  for (const { spot_id, list_id } of rows) (memberships[spot_id] ??= []).push(list_id);
  return memberships;
}

// ── The members mirror (migration 8, S8) ───────────────
// The server's hit_list_members rows of the lists the rider owns, joined or is invited to; written only by
// src/sync/ (pull, lists.ts) with what the server returned, never pushed.

interface MemberRow {
  list_id: string;
  user_id: string;
  role: string;
  status: string;
  joined_at: string | null;
  username: string | null;
}

const MEMBER_COLUMNS = 'm.list_id, m.user_id, m.role, m.status, m.joined_at, p.username';
/** Joined members first, then invitations; by username (unknown last), then id. */
const MEMBER_ORDER = "m.list_id, m.status = 'invited', p.username IS NULL, p.username, m.user_id";

function rowToMember(row: MemberRow): ListMember & { username?: string } {
  return {
    list_id: row.list_id,
    user_id: row.user_id,
    role: row.role as MemberRole,
    status: row.status as MemberStatus,
    ...(row.joined_at !== null ? { joined_at: row.joined_at } : {}),
    ...(row.username !== null ? { username: row.username } : {}),
  };
}

const memberJson = (rows: readonly ListMember[]) =>
  JSON.stringify(rows.map(({ list_id, user_id, role, status, joined_at }) => ({ list_id, user_id, role, status, joined_at: joined_at ?? null })));

/** Inserts or updates `rows` in one statement; resolves how many rows it actually changed. */
export async function upsertMembers(db: SQLiteDatabase, rows: readonly ListMember[]): Promise<number> {
  if (rows.length === 0) return 0;
  const { changes } = await db.runAsync(
    `INSERT INTO hit_list_members (list_id, user_id, role, status, joined_at)
       SELECT json_extract(value, '$.list_id'), json_extract(value, '$.user_id'), json_extract(value, '$.role'),
              json_extract(value, '$.status'), json_extract(value, '$.joined_at')
       FROM json_each(?) WHERE true
     ON CONFLICT(list_id, user_id) DO UPDATE SET
       role = excluded.role, status = excluded.status, joined_at = excluded.joined_at
     WHERE role IS NOT excluded.role OR status IS NOT excluded.status OR joined_at IS NOT excluded.joined_at`,
    memberJson(rows),
  );
  return changes;
}

/** The mirror becomes exactly `rows` (a full read of the server's); resolves whether any row changed. */
export async function replaceMembers(db: SQLiteDatabase, rows: readonly ListMember[]): Promise<boolean> {
  const { changes: removed } = await db.runAsync(
    `DELETE FROM hit_list_members WHERE list_id || '/' || user_id NOT IN (SELECT value FROM json_each(?))`,
    JSON.stringify(rows.map((r) => `${r.list_id}/${r.user_id}`)),
  );
  return (await upsertMembers(db, rows)) > 0 || removed > 0;
}

/** One list's rows, joined members first, with usernames from the profiles mirror. */
export async function getMembers(db: SQLiteDatabase, listId: string): Promise<(ListMember & { username?: string })[]> {
  const rows = await db.getAllAsync<MemberRow>(
    `SELECT ${MEMBER_COLUMNS} FROM hit_list_members m LEFT JOIN profiles p ON p.id = m.user_id
     WHERE m.list_id = ? ORDER BY ${MEMBER_ORDER}`,
    listId,
  );
  return rows.map(rowToMember);
}

/** `{ [listId]: { role, status } }` of the rider's own rows. */
export async function getMyMemberships(
  db: SQLiteDatabase,
  uid: string,
): Promise<Record<string, { role: MemberRole; status: MemberStatus }>> {
  const rows = await db.getAllAsync<{ list_id: string; role: string; status: string }>(
    'SELECT list_id, role, status FROM hit_list_members WHERE user_id = ? ORDER BY list_id',
    uid,
  );
  return Object.fromEntries(
    rows.map((r) => [r.list_id, { role: r.role as MemberRole, status: r.status as MemberStatus }]),
  );
}

export async function deleteMembers(db: SQLiteDatabase, listId: string): Promise<void> {
  await db.runAsync('DELETE FROM hit_list_members WHERE list_id = ?', listId);
}

export async function deleteMember(db: SQLiteDatabase, listId: string, userId: string): Promise<void> {
  await db.runAsync('DELETE FROM hit_list_members WHERE list_id = ? AND user_id = ?', listId, userId);
}
