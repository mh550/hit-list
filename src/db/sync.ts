import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * The sync outbox and sync state (migration 5, docs/plans/2026-10-22-s5-sync.md). The outbox rows of ordinary writes
 * come from the migration's triggers, inside the writing statement; `enqueue` is for the writes no trigger sees
 * (adoption's memberships, tests).
 */
export type OutboxEntity = 'spot' | 'media' | 'hit_list' | 'hit_list_spot';
export type OutboxOp = 'upsert' | 'delete';
/** The tables pull pages through, each with its own `rev` cursor. */
export type SyncTable = 'spots' | 'media' | 'hit_lists' | 'hit_list_spots';

export interface OutboxRow {
  id: number;
  entity: OutboxEntity;
  /** The row id; a membership's is `'<list_id>/<spot_id>'`. */
  entity_id: string;
  op: OutboxOp;
  created_at: string;
  attempts: number;
  last_error?: string;
}

/** From this many failed attempts a row leaves the fresh pass for the once-per-sync backoff pass. */
export const BACKOFF_AFTER_ATTEMPTS = 3;
/** From this many failed attempts a row waits for Profile's Retry (resetFailed). */
export const FAILED_AFTER_ATTEMPTS = 10;

interface OutboxDbRow extends Omit<OutboxRow, 'last_error'> {
  last_error: string | null;
}

const rowToOutbox = ({ last_error, ...row }: OutboxDbRow): OutboxRow => ({
  ...row,
  last_error: last_error ?? undefined,
});

export async function enqueue(
  db: SQLiteDatabase,
  entity: OutboxEntity,
  entityId: string,
  op: OutboxOp,
  at: string = new Date().toISOString(),
): Promise<void> {
  await db.runAsync(
    'INSERT INTO sync_outbox (entity, entity_id, op, created_at) VALUES (?, ?, ?, ?)',
    entity,
    entityId,
    op,
    at,
  );
}

/**
 * `'list/spot'` of every membership of a live list and a live spot (adoption leaves deleted ones phone-only) whose
 * list or spot has no owner yet: the ones adoption must queue
 * itself (the membership trigger only sees inserts). Read it before adoption sets the owners.
 */
export async function adoptableMemberships(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT m.list_id || '/' || m.spot_id AS id FROM hit_list_spots m
     JOIN hit_lists l ON l.id = m.list_id
     JOIN spots s ON s.id = m.spot_id
     WHERE l.deleted_at IS NULL AND s.deleted_at IS NULL AND (l.owner_id IS NULL OR s.owner_id IS NULL)
     ORDER BY m.added_at, m.list_id, m.spot_id`,
  );
  return rows.map((r) => r.id);
}

/** One `hit_list_spot` upsert per id, in one statement; an id that already waits in the outbox is not queued again. */
export async function enqueueMemberships(
  db: SQLiteDatabase,
  ids: string[],
  at: string = new Date().toISOString(),
): Promise<void> {
  if (ids.length === 0) return;
  await db.runAsync(
    `INSERT INTO sync_outbox (entity, entity_id, op, created_at)
     SELECT 'hit_list_spot', j.value, 'upsert', ? FROM json_each(?) j
     WHERE NOT EXISTS (
       SELECT 1 FROM sync_outbox o
       WHERE o.entity = 'hit_list_spot' AND o.entity_id = j.value AND o.op = 'upsert' AND o.parked = 0
     )
     ORDER BY j.key`,
    at,
    JSON.stringify(ids),
  );
}

/**
 * Up to `limit` waiting rows in id order (never parked ones). `skipFailed` leaves out rows that failed
 * BACKOFF_AFTER_ATTEMPTS times; `minAttempts` ≤ attempts < `maxAttempts` picks a window (the backoff pass);
 * `afterId` starts after the rows already seen.
 */
export async function peekOutbox(
  db: SQLiteDatabase,
  limit: number,
  opts: { skipFailed?: boolean; minAttempts?: number; maxAttempts?: number; afterId?: number } = {},
): Promise<OutboxRow[]> {
  const where = ['parked = 0'];
  const values: number[] = [];
  if (opts.skipFailed) {
    where.push('attempts < ?');
    values.push(BACKOFF_AFTER_ATTEMPTS);
  }
  if (opts.minAttempts !== undefined) {
    where.push('attempts >= ?');
    values.push(opts.minAttempts);
  }
  if (opts.maxAttempts !== undefined) {
    where.push('attempts < ?');
    values.push(opts.maxAttempts);
  }
  if (opts.afterId !== undefined) {
    where.push('id > ?');
    values.push(opts.afterId);
  }
  const rows = await db.getAllAsync<OutboxDbRow>(
    `SELECT id, entity, entity_id, op, created_at, attempts, last_error FROM sync_outbox
     WHERE ${where.join(' AND ')} ORDER BY id LIMIT ?`,
    ...values,
    limit,
  );
  return rows.map(rowToOutbox);
}

/** The server confirmed the write: the row is done. Never call it before. */
export async function markDone(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM sync_outbox WHERE id = ?', id);
}

export async function markFailed(db: SQLiteDatabase, id: number, error: string): Promise<void> {
  await db.runAsync('UPDATE sync_outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?', error, id);
}

/** A failure retrying can't fix (RLS, a check, a photo file that is gone): kept with its error, never retried or counted. */
export async function parkRow(db: SQLiteDatabase, id: number, error: string): Promise<void> {
  await db.runAsync('UPDATE sync_outbox SET parked = 1, last_error = ? WHERE id = ?', error, id);
}

async function count(db: SQLiteDatabase, where: string, ...values: number[]): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM sync_outbox WHERE ${where}`, ...values);
  return row?.n ?? 0;
}

/** Every row still to push (failed ones too; parked ones never will); with `upToId`, only rows queued by then. */
export function countPending(db: SQLiteDatabase, upToId?: number): Promise<number> {
  return upToId === undefined ? count(db, 'parked = 0') : count(db, 'parked = 0 AND id <= ?', upToId);
}

/** The newest outbox row's id, 0 when empty. Ids are AUTOINCREMENT (never reused): a later row has a higher id. */
export async function lastOutboxId(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ id: number | null }>('SELECT MAX(id) AS id FROM sync_outbox');
  return row?.id ?? 0;
}

/** Rows waiting for Retry: FAILED_AFTER_ATTEMPTS failures or more. */
export function countFailed(db: SQLiteDatabase): Promise<number> {
  return count(db, 'parked = 0 AND attempts >= ?', FAILED_AFTER_ATTEMPTS);
}

/** Profile's Retry: rows waiting for it go back to a fresh start. */
export async function resetFailed(db: SQLiteDatabase): Promise<void> {
  await db.runAsync(
    'UPDATE sync_outbox SET attempts = 0, last_error = NULL WHERE parked = 0 AND attempts >= ?',
    FAILED_AFTER_ATTEMPTS,
  );
}

export async function clearOutbox(db: SQLiteDatabase): Promise<void> {
  await db.runAsync('DELETE FROM sync_outbox');
}

export async function getSyncState(db: SQLiteDatabase, key: string): Promise<string | undefined> {
  const row = await db.getFirstAsync<{ value: string | null }>('SELECT value FROM sync_state WHERE key = ?', key);
  return row?.value ?? undefined;
}

/** `null` deletes the key. */
export async function setSyncState(db: SQLiteDatabase, key: string, value: string | null): Promise<void> {
  if (value === null) {
    await db.runAsync('DELETE FROM sync_state WHERE key = ?', key);
    return;
  }
  await db.runAsync('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)', key, value);
}

const cursorKey = (table: SyncTable) => `cursor:${table}`;

/** The highest server `rev` pulled for `table`; 0 before the first pull. */
export async function getCursor(db: SQLiteDatabase, table: SyncTable): Promise<number> {
  const value = Number(await getSyncState(db, cursorKey(table)));
  return Number.isFinite(value) ? value : 0;
}

export async function setCursor(db: SQLiteDatabase, table: SyncTable, rev: number): Promise<void> {
  await setSyncState(db, cursorKey(table), String(rev));
}

export async function resetCursors(db: SQLiteDatabase): Promise<void> {
  await db.runAsync("DELETE FROM sync_state WHERE key LIKE 'cursor:%'");
}
