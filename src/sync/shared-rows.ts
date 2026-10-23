import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';

/*
 * Local removals of shared-list rows (S8, docs/plans/2026-10-22-s8-shared-lists.md): Leave, Stop sharing, Remove and
 * the pull's list reconciliation. Every membership is marked `rev = -1` before its DELETE, so the migration 8 trigger
 * queues no server delete; spots, media and lists have no delete trigger, and others' rows never queue anyway. No
 * transaction here: lists.ts opens one; the pull runs without (like the rest of pull.ts).
 */

/** Deletes the memberships `where` picks (an SQL condition on hit_list_spots) without queuing; resolves how many. */
export async function dropMemberships(db: SQLiteDatabase, where: string, ...params: SQLiteBindValue[]): Promise<number> {
  await db.runAsync(`UPDATE hit_list_spots SET rev = -1 WHERE ${where}`, ...params);
  const { changes } = await db.runAsync(`DELETE FROM hit_list_spots WHERE rev = -1 AND (${where})`, ...params);
  return changes;
}

/**
 * Someone else's list leaves the phone (the rider left, was removed, it was unshared or deleted): its memberships, the
 * rider's changes of them still waiting in the outbox (the server took the rider's spots out with them, D43), its
 * mirror rows and the list row. Resolves whether anything was there.
 */
export async function forgetList(db: SQLiteDatabase, listId: string): Promise<boolean> {
  const memberships = await dropMemberships(db, 'list_id = ?', listId);
  await db.runAsync(
    `DELETE FROM sync_outbox WHERE entity = 'hit_list_spot' AND substr(entity_id, 1, length(?) + 1) = ? || '/'`,
    listId,
    listId,
  );
  const { changes: members } = await db.runAsync('DELETE FROM hit_list_members WHERE list_id = ?', listId);
  const { changes: list } = await db.runAsync('DELETE FROM hit_lists WHERE id = ?', listId);
  return memberships + members + list > 0;
}

/** The rider's own list is private again: its mirror rows go, and so do the spots others had put in it (D43). */
export async function unshareLocally(db: SQLiteDatabase, uid: string, listId: string): Promise<void> {
  await db.runAsync('DELETE FROM hit_list_members WHERE list_id = ?', listId);
  await dropMemberships(
    db,
    'list_id = ? AND spot_id IN (SELECT id FROM spots WHERE owner_id IS NOT NULL AND owner_id <> ?)',
    listId,
    uid,
  );
}

/** A member the owner removed: their mirror row and their spots in the list (D43). */
export async function removeMemberLocally(db: SQLiteDatabase, listId: string, userId: string): Promise<void> {
  await db.runAsync('DELETE FROM hit_list_members WHERE list_id = ? AND user_id = ?', listId, userId);
  await dropMemberships(db, 'list_id = ? AND spot_id IN (SELECT id FROM spots WHERE owner_id = ?)', listId, userId);
}

/**
 * Others' spots no list held on the phone shows any more (no membership in a live list, no live shared area list of
 * their owner's) leave with their photo rows and leftover memberships. Never the rider's own or a phone-only row.
 * Resolves their ids, for deleteCachedPhotos.
 */
export async function removeUnheldForeignSpots(db: SQLiteDatabase, uid: string): Promise<string[]> {
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT s.id FROM spots s
     WHERE s.owner_id IS NOT NULL AND s.owner_id <> ?
       AND NOT EXISTS (
         SELECT 1 FROM hit_list_spots m JOIN hit_lists l ON l.id = m.list_id
         WHERE m.spot_id = s.id AND l.deleted_at IS NULL)
       AND NOT EXISTS (
         SELECT 1 FROM hit_lists l
         WHERE l.owner_id = s.owner_id AND l.kind = 'area' AND l.shared = 1 AND l.deleted_at IS NULL)
     ORDER BY s.id`,
    uid,
  );
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];
  const json = JSON.stringify(ids);
  await dropMemberships(db, 'spot_id IN (SELECT value FROM json_each(?))', json);
  await db.runAsync('DELETE FROM media WHERE spot_id IN (SELECT value FROM json_each(?))', json);
  await db.runAsync('DELETE FROM spots WHERE id IN (SELECT value FROM json_each(?))', json);
  return ids;
}
