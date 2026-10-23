import type { SQLiteDatabase } from 'expo-sqlite';

import { countFailed, countPending, getSyncState, lastOutboxId, lastSyncKey, setSyncState } from '@/src/db/sync';
import { useSyncStore } from '@/src/stores/sync-store';
import { getSupabase } from './client';
import { errorMessage } from './errors';
import { loadAndApplyFriends } from './friends';
import { downloadMissingPhotos } from './photos';
import { pull } from './pull';
import { push } from './push';
import { runExclusive } from './queue';
import { reloadStoresQuietly } from './reload';
import { loadAndApplySends } from './sends';

export { runExclusive };
export { reloadStores, reloadStoresQuietly } from './reload';

/** useSync's timer: a sync every 5 minutes while the app is open (D48). */
export const SYNC_INTERVAL_MS = 300_000;

/** The sync queued or running now (`started` once it runs); a call before it starts joins it. */
let current: { promise: Promise<void>; started: boolean } | null = null;
/** The one sync asked for while `current` runs: it starts after `current`, so a change saved meanwhile goes too. */
let followUp: Promise<void> | null = null;

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
    console.warn('[sync] could not read the session:', errorMessage(err));
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
    console.warn(`[sync] ${what} failed:`, errorMessage(err));
    error ??= errorMessage(err);
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
      console.warn('[sync] photo download failed:', errorMessage(err));
    }
    if (changed) await reloadStoresQuietly(db);

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
    // friends and requests (S6), then the sends to the rider (S7), once the backup is settled: a slow read never
    // holds the pulled spots or 'Backed up' back; neither rejects
    await loadAndApplyFriends(db, client, uid);
    await loadAndApplySends(db, client, uid);
  } catch (err) {
    fail('sync', err);
    useSyncStore.setState({ lastError: error });
  } finally {
    useSyncStore.setState({ syncing: false });
  }
}
