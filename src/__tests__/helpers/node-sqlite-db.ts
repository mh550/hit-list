import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SQLiteDatabase, SQLiteBindValue, SQLiteRunResult } from 'expo-sqlite';
import { migrateDb } from '@/src/db/schema';

type Params = SQLiteBindValue[];

// expo-sqlite binds booleans as 1/0; node:sqlite rejects them.
const toNode = (params: Params) =>
  params.map((v) => (typeof v === 'boolean' ? Number(v) : v)) as SQLInputValue[];

/** In-memory SQLite exposing the expo-sqlite methods the app uses (signatures from SQLiteDatabase.d.ts). */
export function createTestDb(): SQLiteDatabase {
  // node:sqlite turns foreign keys ON by default; expo-sqlite (plain SQLite) starts with them OFF
  // until the app runs `PRAGMA foreign_keys = ON`. Match the device so tests prove the app enables it.
  const raw = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
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
  };
  return db as unknown as SQLiteDatabase;
}

/** A fresh in-memory DB already at the latest schema. */
export async function createMigratedTestDb(): Promise<SQLiteDatabase> {
  const db = createTestDb();
  await migrateDb(db);
  return db;
}
