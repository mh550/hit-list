import { useAuthStore } from '@/src/stores/auth-store';
import { useSyncStore } from '@/src/stores/sync-store';
import { isForeign } from '@/src/utils/ownership';

export { isForeign };

/**
 * The owner a new spot or list gets: the signed-in rider once adoption made the phone theirs, else none (signed out,
 * or the moment before adoption, which then takes the row). A photo takes its spot's owner in insertMedia.
 */
export function currentOwnerId(): string | undefined {
  return useSyncStore.getState().adoptedUserId ?? undefined;
}

/**
 * Whose rows count as the rider's own (S8, D47): the signed-in rider, else the phone's account (sync_state.user_id),
 * so another rider's spot is read-only also before the session is read or after it ended.
 */
export function riderId(): string | null {
  return useAuthStore.getState().userId ?? useSyncStore.getState().phoneUserId;
}

/** Throws 'not your spot' / 'not your list' for a row of another rider than the signed-in one: read-only here (D47). */
export function assertOwn(row: { owner_id?: string | null } | undefined, what: 'spot' | 'list'): void {
  if (row && isForeign(row, riderId())) throw new Error(`not your ${what}`);
}
