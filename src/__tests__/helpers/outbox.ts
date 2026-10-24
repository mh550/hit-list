import type { SQLiteDatabase } from 'expo-sqlite';
import { setSyncState } from '@/src/db/sync';

/** The account whose rows are on the test phone (sync_state.user_id). */
export const ME = 'rider-me';

/** Puts `uid` on the phone as its account, so the outbox triggers queue its rows. */
export const adoptPhoneFor = (db: SQLiteDatabase, uid: string = ME) => setSyncState(db, 'user_id', uid);

/** Every outbox row as [entity, entity_id, op], in id order. */
export async function outboxOps(db: SQLiteDatabase): Promise<[string, string, string][]> {
  const rows = await db.getAllAsync<{ entity: string; entity_id: string; op: string }>(
    'SELECT entity, entity_id, op FROM sync_outbox ORDER BY id',
  );
  return rows.map((r) => [r.entity, r.entity_id, r.op]);
}
