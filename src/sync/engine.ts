import type { SQLiteDatabase } from 'expo-sqlite';

import { getAllMedia, getHitLists, getListMemberships, getSpots } from '@/src/db';
import { countFailed, getSyncState, setSyncState } from '@/src/db/sync';
import { useHitListsStore, useMediaStore, useSpotsStore } from '@/src/stores';
import { useSyncStore } from '@/src/stores/sync-store';
import { getSupabase } from './client';
import { downloadMissingPhotos } from './photos';
import { pull } from './pull';
import { push } from './push';

/** useSync's timer: a sync every 5 minutes while the app is open (D48). */
export const SYNC_INTERVAL_MS = 300_000;

/** The tail of the queue every sync and every exclusive task (adopt, Remove from this phone) runs on, one at a time. */
let queue: Promise<unknown> = Promise.resolve();
/** The sync queued or running now: a second syncNow joins it. */
let current: Promise<void> | null = null;

/**
 * Runs `task` once nothing else on the queue runs: never during a sync's push or pull, and a sync asked for meanwhile
 * waits for it. Adoption and Remove (S5-06) go through here, so no push or pull sees their transaction half done.
 */
export function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Push, then pull, then the missing photo files, as the signed-in rider; single-flight (a call while one is queued or
 * running returns that one). Nothing happens without a client, without a session, or while the phone's rows are not
 * the session's rider's (sync_state.user_id: not adopted yet, or another account's). Never rejects: errors are
 * `console.warn` and land in the sync store.
 */
export function syncNow(db: SQLiteDatabase): Promise<void> {
  if (current) return current;
  const run = runExclusive(() => syncOnce(db)).finally(() => {
    if (current === run) current = null;
  });
  current = run;
  return run;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const lastSyncKey = (uid: string) => `last_sync_at:${uid}`;

async function sessionRider(db: SQLiteDatabase): Promise<string | null> {
  const client = getSupabase();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  const uid = data.session?.user.id;
  return uid && (await getSyncState(db, 'user_id')) === uid ? uid : null;
}

async function syncOnce(db: SQLiteDatabase): Promise<void> {
  const client = getSupabase();
  let uid: string | null;
  try {
    uid = await sessionRider(db);
  } catch (err) {
    console.warn('[sync] could not read the session:', message(err));
    return;
  }
  if (!client || !uid) return;

  const shown = useSyncStore.getState();
  const sameRider = shown.userId === uid;
  useSyncStore.setState({
    userId: uid,
    syncing: true,
    failedCount: sameRider ? shown.failedCount : 0,
    lastError: sameRider ? shown.lastError : null,
    lastSyncAt: sameRider ? shown.lastSyncAt : null,
  });

  let error: string | null = null;
  const fail = (what: string, err: unknown) => {
    console.warn(`[sync] ${what} failed:`, message(err));
    error ??= message(err);
  };
  try {
    useSyncStore.setState({ lastSyncAt: (await getSyncState(db, lastSyncKey(uid))) ?? null });

    try {
      const { failed } = await push(db, client, uid);
      if (failed > 0) error ??= `push: ${failed} ${failed === 1 ? 'change' : 'changes'} failed`;
    } catch (err) {
      fail('push', err);
    }
    let changed = false;
    try {
      const result = await pull(db, client, uid);
      changed = result.changed;
      if (result.failed) error ??= 'pull: the server could not be read';
    } catch (err) {
      fail('pull', err);
    }
    try {
      await downloadMissingPhotos(db, client, uid);
    } catch (err) {
      // the photos are already backed up; their files come next sync
      console.warn('[sync] photo download failed:', message(err));
    }
    if (changed) {
      try {
        await reloadStores(db);
      } catch (err) {
        console.warn('[sync] reloading the stores failed:', message(err));
      }
    }

    const failedCount = await countFailed(db);
    if (error === null) {
      const lastSyncAt = new Date().toISOString();
      await setSyncState(db, lastSyncKey(uid), lastSyncAt);
      useSyncStore.setState({ lastSyncAt });
    }
    useSyncStore.setState({ failedCount, lastError: error });
  } catch (err) {
    fail('sync', err);
    useSyncStore.setState({ lastError: error });
  } finally {
    useSyncStore.setState({ syncing: false });
  }
}

/** What a pull changed reaches the screens: the same loads as useDbInit's. */
async function reloadStores(db: SQLiteDatabase): Promise<void> {
  const [spots, media, lists, memberships] = await Promise.all([
    getSpots(db),
    getAllMedia(db),
    getHitLists(db),
    getListMemberships(db),
  ]);
  useSpotsStore.getState().setSpots(spots);
  useMediaStore.getState().setAll(media);
  useHitListsStore.getState().setLists(lists);
  useHitListsStore.getState().setMemberships(memberships);
}
