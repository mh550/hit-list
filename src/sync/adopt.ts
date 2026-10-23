import type { SQLiteDatabase } from 'expo-sqlite';

import {
  adoptableMemberships,
  clearOutbox,
  countPending,
  enqueueMemberships,
  forgetAccount,
  getSyncState,
  resetCursors,
  setSyncState,
} from '@/src/db/sync';
import { clearProfiles } from '@/src/db/profiles';
import { useSyncStore } from '@/src/stores/sync-store';
import { deleteSpotPhotos } from '@/src/utils/photo-storage';
import { reloadStoresQuietly, runExclusive } from './engine';
import { errorMessage } from './errors';
import { defaultPhotoIO, deleteCachedPhotos, type PhotoIO } from './photos';

/*
 * Whose rows are on the phone (S5-06, D38, D66, D67; docs/plans/2026-10-22-s5-sync.md "Adoption", "Sign out").
 * Each runs on the sync queue (runExclusive), so no push or pull sees it half done, and each writes in one
 * transaction: the exception to "no withTransactionAsync for app writes", accepted because they run at sign-in,
 * sign-out or account deletion, when no screen is writing (only a town backfill could, and it is redone next launch).
 * After the commit the photo folders of the removed spots go and the stores reload.
 */

export type AdoptResult = 'done' | 'needs_confirm';

/** The spots and lists Keep after Delete account made phone-only (what its Remove then takes away). */
export interface ReleasedRows {
  spotIds: string[];
  listIds: string[];
}

/** Rows adoption takes: live phone-only spots, live photos of live spots, live lists (a deleted one never uploads). */
const ADOPTABLE_SPOTS = 'owner_id IS NULL AND deleted_at IS NULL';
const ADOPTABLE_MEDIA =
  'owner_id IS NULL AND deleted_at IS NULL AND spot_id IN (SELECT id FROM spots WHERE deleted_at IS NULL)';
const ADOPTABLE_LISTS = 'owner_id IS NULL AND deleted_at IS NULL';

/**
 * Deletes every row that came with an account (owner_id set) except `keep`'s, memberships first, the friend names
 * mirror (D72: they were that account's friends) and the members mirror (S8), and returns the removed spots' ids (for
 * their photo folders and cached photos).
 * `sync_state.user_id` must already be cleared, so no delete trigger queues a server DELETE.
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
  await clearProfiles(db);
  // the shared-list members mirror (S8) was that account's view too
  await db.runAsync('DELETE FROM hit_list_members');
  return spots.map((s) => s.id);
}

/** A row adoption would take. */
async function hasPhoneOnlyRows(db: SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ any: number }>(
    `SELECT EXISTS (SELECT 1 FROM spots WHERE ${ADOPTABLE_SPOTS})
         OR EXISTS (SELECT 1 FROM media WHERE ${ADOPTABLE_MEDIA})
         OR EXISTS (SELECT 1 FROM hit_lists WHERE ${ADOPTABLE_LISTS}) AS any`,
  );
  return row?.any === 1;
}

/**
 * Makes the phone `uid`'s (sign-in, and launch when already signed in). When another account's rows are here, they
 * leave first with their photo files, outbox and cursors (D66); if any of their changes never reached the server it
 * returns 'needs_confirm' and changes nothing, unless `confirmSwitch` (the rider chose Remove and continue). Then every
 * live phone-only spot, photo and list gets `uid` as owner (one deleted before sign-in stays on the phone only, so its
 * photos never upload), the triggers queue their upserts (user_id is set first),
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
        await forgetAccount(db, prev);
        removed = await deleteAccountRows(db, uid);
        await clearOutbox(db);
        await resetCursors(db);
      }
      const memberships = await adoptableMemberships(db);
      await setSyncState(db, 'user_id', uid);
      await db.runAsync(`UPDATE spots SET owner_id = ? WHERE ${ADOPTABLE_SPOTS}`, uid);
      await db.runAsync(`UPDATE media SET owner_id = ? WHERE ${ADOPTABLE_MEDIA}`, uid);
      await db.runAsync(`UPDATE hit_lists SET owner_id = ? WHERE ${ADOPTABLE_LISTS}`, uid);
      await enqueueMemberships(db, memberships);
    });
    deleteSpotPhotos(removed);
    deleteCachedPhotos(removed);
    await reloadStoresQuietly(db);
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
    // from now on a new spot is phone-only, also while the sign-out itself still runs
    useSyncStore.setState({ adoptedUserId: null });
    let removed: string[] = [];
    await db.withTransactionAsync(async () => {
      await forgetAccount(db, uid);
      removed = await deleteAccountRows(db, null);
      await clearOutbox(db);
      await resetCursors(db);
    });
    deleteSpotPhotos(removed);
    deleteCachedPhotos(removed);
    await reloadStoresQuietly(db);
    return true;
  });
}

/**
 * Keep after Delete account (D67), run as soon as the account is gone, before the rider answers Keep / Remove (an
 * unanswered alert must not leave rows a later sign-in would remove as another account's): `uid`'s spots, photos,
 * lists and memberships become phone-only again (owner and rev cleared), so a later sign-in adopts them like any
 * other; photo rows whose file never reached this phone go (there is nowhere left to download them from), rows of
 * other accounts go, and the outbox, cursors and user_id are cleared. Photo files on the phone stay. Resolves the
 * spots and lists it released, for removeReleasedRows.
 */
export function releaseAccountData(
  db: SQLiteDatabase,
  uid: string,
  io: Pick<PhotoIO, 'exists'> = defaultPhotoIO,
): Promise<ReleasedRows> {
  return runExclusive(() => release(db, uid, io));
}

/**
 * Delete account (S4-05) then Keep (D67) as one task on the sync queue: a sync already running finishes first, and
 * none starts between the server delete and the release (a pull after the delete would see an empty account and
 * reconcile the rider's list memberships away; after the release user_id is cleared, so no sync runs). `deleteServer`
 * resolves whether the server deleted the account. A release that fails after the delete only warns: the account is
 * gone either way.
 */
export function deleteAccountAndRelease(
  db: SQLiteDatabase,
  uid: string,
  deleteServer: () => Promise<boolean>,
  io: Pick<PhotoIO, 'exists'> = defaultPhotoIO,
): Promise<{ deleted: false } | { deleted: true; released: ReleasedRows | null }> {
  return runExclusive(async () => {
    if (!(await deleteServer())) return { deleted: false };
    try {
      return { deleted: true, released: await release(db, uid, io) };
    } catch (err) {
      console.warn('[sync] keeping the spots after Delete account failed:', errorMessage(err));
      return { deleted: true, released: null };
    }
  });
}

async function release(db: SQLiteDatabase, uid: string, io: Pick<PhotoIO, 'exists'>): Promise<ReleasedRows> {
  useSyncStore.setState({ adoptedUserId: null });
  let removed: string[] = [];
  const released: ReleasedRows = { spotIds: [], listIds: [] };
  await db.withTransactionAsync(async () => {
    await forgetAccount(db, uid);
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
    const ids = async (table: 'spots' | 'hit_lists') =>
      (await db.getAllAsync<{ id: string }>(`SELECT id FROM ${table} WHERE owner_id = ? ORDER BY id`, uid)).map(
        (r) => r.id,
      );
    released.spotIds = await ids('spots');
    released.listIds = await ids('hit_lists');
    await db.runAsync('UPDATE spots SET owner_id = NULL, rev = NULL WHERE owner_id = ?', uid);
    await db.runAsync('UPDATE media SET owner_id = NULL, rev = NULL WHERE owner_id = ?', uid);
    await db.runAsync('UPDATE hit_lists SET owner_id = NULL, rev = NULL WHERE owner_id = ?', uid);
    await db.runAsync('UPDATE hit_list_spots SET rev = NULL WHERE rev IS NOT NULL');
    await clearOutbox(db);
    await resetCursors(db);
  });
  deleteSpotPhotos(removed);
  deleteCachedPhotos(removed);
  await reloadStoresQuietly(db);
  return released;
}

/**
 * Remove after Delete account: the spots and lists releaseAccountData released, with their photos, memberships and
 * photo files. Rows a sign-in adopted since are no longer phone-only and stay.
 */
export function removeReleasedRows(db: SQLiteDatabase, released: ReleasedRows): Promise<void> {
  return runExclusive(async () => {
    const spots = JSON.stringify(released.spotIds);
    const lists = JSON.stringify(released.listIds);
    const phoneOnlyIn = 'owner_id IS NULL AND id IN (SELECT value FROM json_each(?))';
    let removed: string[] = [];
    await db.withTransactionAsync(async () => {
      removed = (await db.getAllAsync<{ id: string }>(`SELECT id FROM spots WHERE ${phoneOnlyIn}`, spots)).map((r) => r.id);
      const gone = JSON.stringify(removed);
      await db.runAsync(
        `DELETE FROM hit_list_spots WHERE spot_id IN (SELECT value FROM json_each(?))
           OR list_id IN (SELECT id FROM hit_lists WHERE ${phoneOnlyIn})`,
        gone,
        lists,
      );
      await db.runAsync('DELETE FROM media WHERE spot_id IN (SELECT value FROM json_each(?))', gone);
      await db.runAsync('DELETE FROM spots WHERE id IN (SELECT value FROM json_each(?))', gone);
      await db.runAsync(`DELETE FROM hit_lists WHERE ${phoneOnlyIn}`, lists);
    });
    deleteSpotPhotos(removed);
    deleteCachedPhotos(removed);
    await reloadStoresQuietly(db);
  });
}
