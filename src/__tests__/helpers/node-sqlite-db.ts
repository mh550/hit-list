import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SQLiteDatabase, SQLiteBindValue, SQLiteRunResult } from 'expo-sqlite';

type Params = SQLiteBindValue[] | [SQLiteBindValue[]];

function toNode(params: Params): SQLInputValue[] {
  const flat =
    params.length === 1 && Array.isArray(params[0]) ? params[0] : (params as SQLiteBindValue[]);
  return flat.map((v) => {
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v !== null && typeof v === 'object' && !(v instanceof Uint8Array)) {
      throw new Error('node-sqlite-db: only positional parameters are supported');
    }
    return v as SQLInputValue;
  });
}

/** In-memory SQLite exposing the expo-sqlite methods the app uses (signatures from SQLiteDatabase.d.ts). */
export function createTestDb(): SQLiteDatabase {
  const raw = new DatabaseSync(':memory:');
  const db = {
    async execAsync(source: string): Promise<void> {
      raw.exec(source);
    },
    async runAsync(source: string, ...params: Params): Promise<SQLiteRunResult> {
      const r = raw.prepare(source).run(...toNode(params));
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async getFirstAsync<T>(source: string, ...params: Params): Promise<T | null> {
      return (raw.prepare(source).get(...toNode(params)) as T | undefined) ?? null;
    },
    async getAllAsync<T>(source: string, ...params: Params): Promise<T[]> {
      return raw.prepare(source).all(...toNode(params)) as T[];
    },
    async withTransactionAsync(task: () => Promise<void>): Promise<void> {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
    async closeAsync(): Promise<void> {
      raw.close();
    },
  };
  return db as unknown as SQLiteDatabase;
}
