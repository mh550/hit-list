import type { SQLiteDatabase } from 'expo-sqlite';

import { getAllMedia, getHitLists, getListMemberships, getSpots } from '@/src/db';
import { getSyncState } from '@/src/db/sync';
import { useHitListsStore, useMediaStore, useSpotsStore } from '@/src/stores';
import { useSyncStore } from '@/src/stores/sync-store';
import { errorMessage } from './errors';

// The stores after a commit outside the action hooks (a pull, adoption, a saved send): out of engine.ts so the
// modules engine.ts loads (sends.ts) can reload too; engine.ts re-exports both.

/** reloadStores after a commit: a failure only warns (the next pull that changes rows reloads again). */
export async function reloadStoresQuietly(db: SQLiteDatabase): Promise<void> {
  try {
    await reloadStores(db);
  } catch (err) {
    console.warn('[sync] reloading the stores failed:', errorMessage(err));
  }
}

/** Reads before giving up on a reload the rider keeps changing (the next pull that changes rows reloads again). */
const RELOAD_TRIES = 3;

/** The store values a reload replaces; the action hooks replace them (store first, then the DB) on every change. */
const storeValues = () => [
  useSpotsStore.getState().spots,
  useMediaStore.getState().mediaBySpot,
  useHitListsStore.getState().lists,
  useHitListsStore.getState().membershipBySpot,
];

/**
 * What a pull (or adoption, src/sync/adopt.ts) changed reaches the screens: the same loads as useDbInit's. A change the rider made while the loads ran
 * is in the store but maybe not in what was read, so then it reads again rather than put an older state back (the
 * action hooks issue their DB write right after the store update, so the next read sees it).
 */
export async function reloadStores(db: SQLiteDatabase): Promise<void> {
  for (let attempt = 0; attempt < RELOAD_TRIES; attempt += 1) {
    const before = storeValues();
    const [spots, media, lists, memberships, phoneUserId] = await Promise.all([
      getSpots(db),
      getAllMedia(db),
      getHitLists(db),
      getListMemberships(db),
      getSyncState(db, 'user_id'),
    ]);
    if (storeValues().some((value, i) => value !== before[i])) continue;
    useSpotsStore.getState().setSpots(spots);
    useMediaStore.getState().setAll(media);
    useHitListsStore.getState().setLists(lists);
    useHitListsStore.getState().setMemberships(memberships);
    useSyncStore.setState({ phoneUserId: phoneUserId ?? null });
    return;
  }
  console.warn('[sync] the stores kept changing; they reload after the next pull that changes rows');
}
