import type { SQLiteDatabase } from 'expo-sqlite';

import { getAllMedia, getHitLists, getListMemberships, getSpots } from '@/src/db';
import { countFailed, countPending, getSyncState, lastOutboxId, setSyncState } from '@/src/db/sync';
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
/** The sync queued or running now (`started` once it runs); a call before it starts joins it. */
let current: { promise: Promise<void>; started: boolean } | null = null;
/** The one sync asked for while `current` runs: it starts after `current`, so a change saved meanwhile goes too. */
let followUp: Promise<void> | null = null;

/**
 * Runs `task` once nothing else on the queue runs: never during a sync's push or pull, and a sync asked for meanwhile
 * waits for it. Adoption and Remove (S5-06) go through here, so no push or pull sees their transaction half done.
 * A task must not await syncNow (that sync queues behind the task: a deadlock); `void syncNow(db)` inside it, or
 * awaiting it after runExclusive resolves, is fine.
 */
export function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Push, then pull, then the missing photo files, as the signed-in rider; single-flight: a call while a sync waits to
 * start joins it, a call while one runs gets exactly one more sync after it (Retry or pull-to-refresh right after an
 * edit must not join a sync already past its push). Nothing happens without a client, without a session, or while
 * the phone's rows are not the session's rider's (sync_state.user_id: not adopted yet, or another account's). Never
 * rejects: errors are `console.warn` and land in the sync store.
 */
export function syncNow(db: SQLiteDatabase): Promise<void> {
  if (current && !current.started) return current.promise;
  if (current) {
    followUp ??= current.promise.then(() => {
      followUp = null;
      return syncNow(db);
    });
    return followUp;
  }
  const entry = {
    started: false,
    promise: runExclusive(() => {
      entry.started = true;
      return syncOnce(db);
    }).finally(() => {
      if (current === entry) current = null;
    }),
  };
  current = entry;
  return entry.promise;
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
    // Backed up = every change queued before this sync reached the server (one saved meanwhile goes next time).
    const queuedBefore = await lastOutboxId(db);

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
    const waiting = await countPending(db, queuedBefore);
    if (waiting > 0) error ??= `${waiting} ${waiting === 1 ? 'change' : 'changes'} still waiting`;
    // push and pull quietly do nothing once the session is gone: that is not a backup either
    if (error === null && (await sessionRider(db)) !== uid) error = 'signed out during the sync';
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
    const [spots, media, lists, memberships] = await Promise.all([
      getSpots(db),
      getAllMedia(db),
      getHitLists(db),
      getListMemberships(db),
    ]);
    if (storeValues().some((value, i) => value !== before[i])) continue;
    useSpotsStore.getState().setSpots(spots);
    useMediaStore.getState().setAll(media);
    useHitListsStore.getState().setLists(lists);
    useHitListsStore.getState().setMemberships(memberships);
    return;
  }
  console.warn('[sync] the stores kept changing; they reload after the next pull that changes rows');
}
