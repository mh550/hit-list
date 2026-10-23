import type { HitList, HitListMember } from '@/src/types';

/*
 * Who is in a shared hit list (S8), pure. The owner is implicit (owner_id); the mirror holds everyone else.
 */

/** The members who joined, in mirror order; invitations aren't members yet. */
export function joinedMembers(list: Pick<HitList, 'members'>): HitListMember[] {
  return (list.members ?? []).filter((m) => m.status === 'member');
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
