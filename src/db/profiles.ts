import type { SQLiteDatabase } from 'expo-sqlite';
import type { FriendProfile } from '@/src/types';

/*
 * The local mirror of friend names (migration 6, D72): what the server's profiles select and a find_profile hit
 * returned, so names show offline. Never in the outbox. Callers upsert only rows the server returned, never the
 * null placeholders of rows it would not let the rider read.
 */

/** Inserts or updates `rows` in one statement; a NULL username never erases a known one. */
export async function upsertProfiles(db: SQLiteDatabase, rows: readonly FriendProfile[]): Promise<void> {
  if (rows.length === 0) return;
  await db.runAsync(
    `INSERT INTO profiles (id, username, display_name)
       SELECT json_extract(value, '$.id'), json_extract(value, '$.username'), json_extract(value, '$.display_name')
       FROM json_each(?) WHERE true
     ON CONFLICT(id) DO UPDATE SET
       username = COALESCE(excluded.username, profiles.username),
       display_name = excluded.display_name`,
    JSON.stringify(rows.map(({ id, username, display_name }) => ({ id, username, display_name }))),
  );
}

/** The mirrored profiles among `ids`, by id (an id never mirrored is absent). */
export async function getProfiles(db: SQLiteDatabase, ids: readonly string[]): Promise<Record<string, FriendProfile>> {
  if (ids.length === 0) return {};
  const rows = await db.getAllAsync<FriendProfile>(
    'SELECT id, username, display_name FROM profiles WHERE id IN (SELECT value FROM json_each(?))',
    JSON.stringify(ids),
  );
  return Object.fromEntries(rows.map((row) => [row.id, row]));
}

export async function clearProfiles(db: SQLiteDatabase): Promise<void> {
  await db.runAsync('DELETE FROM profiles');
}
