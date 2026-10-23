import { useAuthStore } from '@/src/stores/auth-store';
import { useSyncStore } from '@/src/stores/sync-store';

/**
 * The owner a new spot or list gets: the signed-in rider once adoption made the phone theirs, else none (signed out,
 * or the moment before adoption, which then takes the row). A photo takes its spot's owner in insertMedia.
 */
export function currentOwnerId(): string | undefined {
  return useSyncStore.getState().adoptedUserId ?? undefined;
}

/**
 * Another rider's row (S8, D47): its owner is set and isn't `uid`. Signed out (`uid` null) nothing is: sign-out takes
 * others' rows off the phone (D86), so what stays is the rider's own or phone-only.
 */
export function isForeign(row: { owner_id?: string | null }, uid: string | null | undefined): boolean {
  return !!uid && row.owner_id != null && row.owner_id !== uid;
}

/** Throws 'not your spot' / 'not your list' for a row of another rider than the signed-in one: read-only here (D47). */
export function assertOwn(row: { owner_id?: string | null } | undefined, what: 'spot' | 'list'): void {
  if (row && isForeign(row, useAuthStore.getState().userId)) throw new Error(`not your ${what}`);
}
