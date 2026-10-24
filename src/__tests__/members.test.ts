import { ROLE_LABELS } from '@/src/constants/labels';
import { handleOf, initialOf, joinedMembers, memberCount } from '@/src/utils/members';
import type { HitListMember } from '@/src/types';
import { createTestHitList } from './factories';

const m = (user_id: string, status: HitListMember['status'], username?: string): HitListMember => ({
  user_id,
  role: 'add',
  status,
  ...(username ? { username } : {}),
});

describe('members (src/utils/members.ts, S8-04)', () => {
  it('memberCount = joined members + the owner; invitations never count (D84)', () => {
    const list = createTestHitList({
      shared: true,
      members: [m('u-ana', 'member'), m('u-ben', 'member'), m('u-cal', 'invited'), m('u-dee', 'member')],
    });
    expect(memberCount(list)).toBe(4);
    expect(memberCount(createTestHitList({ shared: true }))).toBe(1);
  });

  it('joinedMembers keeps the members with status member, in mirror order', () => {
    const list = createTestHitList({ members: [m('u-ana', 'member'), m('u-cal', 'invited'), m('u-ben', 'member')] });
    expect(joinedMembers(list).map((x) => x.user_id)).toEqual(['u-ana', 'u-ben']);
    expect(joinedMembers(createTestHitList())).toEqual([]);
  });

  it("initialOf is the username's first letter, upper case; '?' without a name", () => {
    expect(initialOf('ana')).toBe('A');
    expect(initialOf('_x')).toBe('_');
    expect(initialOf(undefined)).toBe('?');
    expect(initialOf('')).toBe('?');
  });

  it("handleOf is '@ana', else the fallback", () => {
    expect(handleOf('ana')).toBe('@ana');
    expect(handleOf(undefined)).toBe('A rider');
    expect(handleOf(null, 'Invited rider')).toBe('Invited rider');
  });

  it('ROLE_LABELS names the two roles (D42)', () => {
    expect(ROLE_LABELS).toEqual({ add: 'Can add spots', view: 'View only' });
  });
});
