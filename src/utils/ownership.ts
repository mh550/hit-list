/*
 * Whose a row is (S8, D47), pure: src/sync/owner.ts adds the signed-in rider.
 */

/**
 * Another rider's row: its owner is set and isn't `uid`. Signed out (`uid` null) nothing is: sign-out takes others'
 * rows off the phone (D86), so what stays is the rider's own or phone-only.
 */
export function isForeign(row: { owner_id?: string | null }, uid: string | null | undefined): boolean {
  return !!uid && row.owner_id != null && row.owner_id !== uid;
}

/** The small owner badge of another rider's spot: '@ana', 'A friend' while the name isn't mirrored yet; else none. */
export function ownerLabel(
  spot: { owner_id?: string; owner_username?: string },
  uid: string | null | undefined,
): string | undefined {
  if (!isForeign(spot, uid)) return undefined;
  return spot.owner_username ? `@${spot.owner_username}` : 'A friend';
}
