import type { SQLiteDatabase } from 'expo-sqlite';

import {
  adoptableMemberships,
  clearOutbox,
  countPending,
  enqueueMemberships,
  getSyncState,
  resetCursors,
  setSyncState,
} from '@/src/db/sync';
import { deleteSpotPhotos } from '@/src/utils/photo-storage';
import { reloadStores, runExclusive } from './engine';
import { defaultPhotoIO, type PhotoIO } from './photos';

/*
 * Whose rows are on the phone (S5-06, D38, D66, D67; docs/plans/2026-10-22-s5-sync.md "Adoption", "Sign out").
 * Each runs on the sync queue (runExclusive), so no push or pull sees it half done, and each writes in one
 * transaction: the exception to "no withTransactionAsync for app writes", accepted because they run at sign-in,
 * sign-out or account deletion, when no screen is writing (only a town backfill could, and it is redone next launch).
 * After the commit the photo folders of the removed spots go and the stores reload.
 */

export type AdoptResult = 'done' | 'needs_confirm';

/**
 * Deletes every row that came with an account (owner_id set) except `keep`'s, memberships first, and returns the
 * removed spots' ids (for their photo folders). `sync_state.user_id` must already be cleared, so no delete trigger
 * queues a server DELETE.
 */
async function deleteAccountRows(db: SQLiteDatabase, keep: string | null): Promise<string[]> {
  const owned = 'owner_id IS NOT NULL AND owner_id IS NOT ?';
  const spots = await db.getAllAsync<{ id: string }>(`SELECT id FROM spots WHERE ${owned}`, keep);
  await db.runAsync(
    `DELETE FROM hit_list_spots
     WHERE list_id IN (SELECT id FROM hit_lists WHERE ${owned}) OR spot_id IN (SELECT id FROM spots WHERE ${owned})`,
    keep,
    keep,
  );
  await db.runAsync(
    `DELETE FROM media WHERE ${owned} OR spot_id IN (SELECT id FROM spots WHERE ${owned})`,
    keep,
    keep,
  );
  await db.runAsync(`DELETE FROM spots WHERE ${owned}`, keep);
  await db.runAsync(`DELETE FROM hit_lists WHERE ${owned}`, keep);
  return spots.map((s) => s.id);
}

/** A row adoption would take: a phone-only spot, photo or live list. */
async function hasPhoneOnlyRows(db: SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ any: number }>(
    `SELECT EXISTS (SELECT 1 FROM spots WHERE owner_id IS NULL)
         OR EXISTS (SELECT 1 FROM media WHERE owner_id IS NULL)
         OR EXISTS (SELECT 1 FROM hit_lists WHERE owner_id IS NULL AND deleted_at IS NULL) AS any`,
  );
  return row?.any === 1;
}

/**
 * Makes the phone `uid`'s (sign-in, and launch when already signed in). When another account's rows are here, they
 * leave first with their photo files, outbox and cursors (D66); if any of their changes never reached the server it
 * returns 'needs_confirm' and changes nothing, unless `confirmSwitch` (the rider chose Remove and continue). Then every
 * phone-only spot, photo and live list gets `uid` as owner, the triggers queue their upserts (user_id is set first),
 * and the memberships that just became fully owned are queued after them. Idempotent: with nothing phone-only and the
 * phone already `uid`'s it writes nothing. The caller syncs afterwards (never from inside: see runExclusive).
 */
export function adopt(
  db: SQLiteDatabase,
  uid: string,
  opts: { confirmSwitch?: boolean } = {},
): Promise<AdoptResult> {
  return runExclusive(async (): Promise<AdoptResult> => {
    const prev = await getSyncState(db, 'user_id');
    const switching = prev !== uid;
    if (prev !== undefined && switching && !opts.confirmSwitch && (await countPending(db)) > 0) return 'needs_confirm';
    if (!switching && !(await hasPhoneOnlyRows(db))) return 'done';

    let removed: string[] = [];
    await db.withTransactionAsync(async () => {
      if (switching) {
        await setSyncState(db, 'user_id', null);
        removed = await deleteAccountRows(db, uid);
        await clearOutbox(db);
        await resetCursors(db);
      }
      const memberships = await adoptableMemberships(db);
      await setSyncState(db, 'user_id', uid);
      await db.runAsync('UPDATE spots SET owner_id = ? WHERE owner_id IS NULL', uid);
      await db.runAsync('UPDATE media SET owner_id = ? WHERE owner_id IS NULL', uid);
      await db.runAsync('UPDATE hit_lists SET owner_id = ? WHERE owner_id IS NULL AND deleted_at IS NULL', uid);
      await enqueueMemberships(db, memberships);
    });
    deleteSpotPhotos(removed);
    await reloadStores(db);
    return 'done';
  });
}

/**
 * Remove from this phone (D38): the account's rows (and whatever else came with it) and their photo files leave, the
 * outbox and `uid`'s sync state are cleared; phone-only spots stay. Resolves false and removes nothing while a change
 * still waits to be backed up (D69), unless `discardPending` (after Delete account: there is no account to reach).
 */
export function removeLocalAccountData(
  db: SQLiteDatabase,
  uid: string,
  opts: { discardPending?: boolean } = {},
): Promise<boolean> {
  return runExclusive(async () => {
    if (!opts.discardPending && (await countPending(db)) > 0) return false;
    let removed: string[] = [];
    await db.withTransactionAsync(async () => {
      await setSyncState(db, 'user_id', null);
      await setSyncState(db, `last_sync_at:${uid}`, null);
      removed = await deleteAccountRows(db, null);
      await clearOutbox(db);
      await resetCursors(db);
    });
    deleteSpotPhotos(removed);
    await reloadStores(db);
    return true;
  });
}

/**
 * Keep after Delete account (D67): `uid`'s spots, photos, lists and memberships become phone-only again (owner and
 * rev cleared), so a later sign-in adopts them like any other; photo rows whose file never reached this phone go
 * (there is nowhere left to download them from), rows of other accounts go, and the outbox, cursors and user_id are
 * cleared. Photo files on the phone stay.
 */
export function releaseAccountData(
  db: SQLiteDatabase,
  uid: string,
  io: Pick<PhotoIO, 'exists'> = defaultPhotoIO,
): Promise<void> {
  return runExclusive(async () => {
    let removed: string[] = [];
    await db.withTransactionAsync(async () => {
      await setSyncState(db, 'user_id', null);
      await setSyncState(db, `last_sync_at:${uid}`, null);
      removed = await deleteAccountRows(db, uid);
      const media = await db.getAllAsync<{ id: string; file_path: string }>(
        'SELECT id, file_path FROM media WHERE owner_id = ?',
        uid,
      );
      const missing = JSON.stringify(media.filter((m) => !io.exists(m.file_path)).map((m) => m.id));
      await db.runAsync(
        'UPDATE spots SET primary_photo_id = NULL WHERE primary_photo_id IN (SELECT value FROM json_each(?))',
        missing,
      );
      await db.runAsync('DELETE FROM media WHERE id IN (SELECT value FROM json_each(?))', missing);
      await db.runAsync('UPDATE spots SET owner_id = NULL, rev = NULL WHERE owner_id = ?', uid);
      await db.runAsync('UPDATE media SET owner_id = NULL, rev = NULL WHERE owner_id = ?', uid);
      await db.runAsync('UPDATE hit_lists SET owner_id = NULL, rev = NULL WHERE owner_id = ?', uid);
      await db.runAsync('UPDATE hit_list_spots SET rev = NULL WHERE rev IS NOT NULL');
      await clearOutbox(db);
      await resetCursors(db);
    });
    deleteSpotPhotos(removed);
    await reloadStores(db);
  });
}
