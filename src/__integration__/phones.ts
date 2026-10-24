/**
 * A phone against the local stack (S5-07, shared with S7-06's send test): its photo folder on disk and one sync as the
 * engine runs it. Node has no image manipulator, so `prepare` hands the stored bytes over unchanged: a byte-for-byte
 * check proves the transport and the storage path, not D46's re-encoding (tested in sync-photos.test.ts).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { countPending } from '@/src/db/sync';
import { downloadMissingPhotos, type PhotoIO } from '@/src/sync/photos';
import { pull } from '@/src/sync/pull';
import { push } from '@/src/sync/push';

export const FIXTURE = new Uint8Array(readFileSync(join(__dirname, '../__tests__/fixtures/photo-2kb.jpg')));

/** A phone's photo folder on disk (Paths.document's stand-in): `photos/<spot>/<media>.jpg` under `root`. */
export function nodePhotoIO(root: string): PhotoIO {
  const at = (filePath: string) => join(root, filePath);
  return {
    exists: (filePath) => existsSync(at(filePath)),
    async prepare(filePath) {
      return { uri: at(filePath), bytes: new Uint8Array(readFileSync(at(filePath))), cleanup: () => {} };
    },
    write(filePath, bytes) {
      mkdirSync(dirname(at(filePath)), { recursive: true });
      writeFileSync(at(filePath), bytes);
    },
    remove(filePath) {
      rmSync(at(filePath), { force: true });
    },
  };
}

/** A push that sent everything it tried. */
export async function pushAll(db: SQLiteDatabase, client: SupabaseClient, uid: string, io: PhotoIO): Promise<void> {
  expect((await push(db, client, uid, io)).failed).toBe(0);
}

/** A pull that read every table. */
export async function pullAll(db: SQLiteDatabase, client: SupabaseClient, uid: string): Promise<void> {
  expect((await pull(db, client, uid)).failed).toBeFalsy();
}

/**
 * One sync as the engine runs it (push → pull → missing photos), failing the test on anything not done; resolves how
 * many photo files it downloaded.
 */
export async function sync(db: SQLiteDatabase, client: SupabaseClient, uid: string, io: PhotoIO): Promise<number> {
  await pushAll(db, client, uid, io);
  await pullAll(db, client, uid);
  const downloaded = await downloadMissingPhotos(db, client, uid, io);
  expect(await countPending(db)).toBe(0);
  return downloaded;
}
