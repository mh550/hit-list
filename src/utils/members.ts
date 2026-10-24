import type { HitList, HitListMember, MemberRole } from '@/src/types';
import { isForeign } from './ownership';

/*
 * Who is in a shared hit list (S8), pure. The owner is implicit (owner_id); the mirror holds everyone else.
 */

/** The members who joined, in mirror order; invitations aren't members yet. */
export function joinedMembers(list: Pick<HitList, 'members'>): HitListMember[] {
  return (list.members ?? []).filter((m) => m.status === 'member');
}

/**
 * Shared (S8): the flag, or someone joined it. A list of another rider's on this phone was shared with the rider even
 * before its flag arrives.
 */
export function isShared(list: Pick<HitList, 'shared' | 'members'>): boolean {
  return list.shared || joinedMembers(list).length > 0;
}

/** The count shown anywhere (D84): joined members + the owner; invitations never count. */
export function memberCount(list: Pick<HitList, 'members'>): number {
  return joinedMembers(list).length + 1;
}

/** One initials circle: the username's first letter, upper case; '?' while the name isn't mirrored. */
export function initialOf(username: string | null | undefined): string {
  return username ? username.charAt(0).toUpperCase() : '?';
}

/** '@ana', or `fallback` while the name isn't mirrored (an invitee's profile isn't readable by members). */
export function handleOf(username: string | null | undefined, fallback = 'A rider'): string {
  return username ? `@${username}` : fallback;
}

/**
 * The rider's part in a list: 'owner' for theirs (or a phone-only one), else their role once joined (D42); undefined
 * for another rider's list they haven't joined.
 */
export function myRole(
  list: Pick<HitList, 'owner_id' | 'members'>,
  uid: string | null,
): 'owner' | MemberRole | undefined {
  if (!isForeign(list, uid)) return 'owner';
  return list.members?.find((m) => m.user_id === uid && m.status === 'member')?.role;
}
