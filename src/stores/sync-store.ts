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
  /**
   * The phone's account (sync_state.user_id: the last rider adopted here, kept after a sign-out with Keep), loaded at
   * launch and on every store reload. Whose rows are the rider's own while the session isn't read (offline launch,
   * an ended session): others' spots stay read-only then too (S8, D47).
   */
  phoneUserId: string | null;
}

export const INITIAL_SYNC: SyncSnapshot = {
  userId: null,
  lastSyncAt: null,
  syncing: false,
  failedCount: 0,
  lastError: null,
  adoptedUserId: null,
  phoneUserId: null,
};

export const useSyncStore = create<SyncSnapshot>(() => ({ ...INITIAL_SYNC }));
