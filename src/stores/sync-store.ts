import { create } from 'zustand';

// What the last sync left (src/sync/engine.ts writes it; Profile and the Spots tab's pull-to-refresh read it).
// `userId` is the rider those values belong to: a screen shows them only for the account signed in now.
export interface SyncSnapshot {
  userId: string | null;
  /** When a sync last finished with no error (ISO), kept per rider in sync_state so a relaunch knows it. */
  lastSyncAt: string | null;
  syncing: boolean;
  /** Outbox rows waiting for Retry (countFailed). */
  failedCount: number;
  /** The last sync's first error message, `null` after one that went through. */
  lastError: string | null;
  /**
   * The signed-in rider once adoption made the phone's rows theirs (useAdoption), `null` signed out: new spots and
   * lists get it as owner (src/sync/owner.ts).
   */
  adoptedUserId: string | null;
}

export const INITIAL_SYNC: SyncSnapshot = {
  userId: null,
  lastSyncAt: null,
  syncing: false,
  failedCount: 0,
  lastError: null,
  adoptedUserId: null,
};

export const useSyncStore = create<SyncSnapshot>(() => ({ ...INITIAL_SYNC }));
