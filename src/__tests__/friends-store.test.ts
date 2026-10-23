import { SIGNED_OUT, useAuthStore } from '@/src/stores/auth-store';
import { EMPTY_FRIENDS, useFriendsStore } from '@/src/stores/friends-store';
import type { FriendsData } from '@/src/sync/friends';

const data: FriendsData = {
  friends: [
    {
      friendshipId: 'f-ana',
      created_at: '2026-10-19T09:00:00.000Z',
      profile: { id: 'rider-ana', username: 'ana', display_name: 'Ana B' },
    },
  ],
  incoming: [
    { friendshipId: 'f-zed', created_at: '2026-10-21T10:00:00.000Z', profile: { id: 'rider-zed', username: 'zed', display_name: null } },
  ],
  outgoing: [],
  blocked: [],
};

const signIn = (userId: string) => useAuthStore.setState({ ...SIGNED_OUT, status: 'signed_in', userId });

beforeEach(() => {
  useAuthStore.setState({ ...SIGNED_OUT });
  useFriendsStore.getState().clearFriends();
});

describe('useFriendsStore', () => {
  it('starts empty, not loaded', () => {
    expect(useFriendsStore.getState()).toMatchObject({ ...EMPTY_FRIENDS, userId: null, loadedAt: null, loadError: null });
  });

  it("applyFriends sets the signed-in rider's friends, requests and blocks", () => {
    signIn('rider-me');

    useFriendsStore.getState().applyFriends('rider-me', data);

    expect(useFriendsStore.getState()).toMatchObject({ userId: 'rider-me', ...data, loadError: null });
    expect(useFriendsStore.getState().loadedAt).toEqual(expect.any(String));
  });

  it('ignores applyFriends for a rider who is not the one signed in', () => {
    signIn('rider-me');

    useFriendsStore.getState().applyFriends('someone-else', data);

    expect(useFriendsStore.getState()).toMatchObject({ ...EMPTY_FRIENDS, userId: null });
  });

  it('empties itself when the signed-in rider changes (sign-out, another account)', () => {
    signIn('rider-me');
    useFriendsStore.getState().applyFriends('rider-me', data);

    signIn('rider-other');

    expect(useFriendsStore.getState()).toMatchObject({ ...EMPTY_FRIENDS, userId: null, loadedAt: null });

    useFriendsStore.getState().applyFriends('rider-other', data);
    useAuthStore.setState({ ...SIGNED_OUT });
    expect(useFriendsStore.getState()).toMatchObject({ ...EMPTY_FRIENDS, userId: null });
  });

  it('keeps its data when the auth store changes something else (a username saved)', () => {
    signIn('rider-me');
    useFriendsStore.getState().applyFriends('rider-me', data);

    useAuthStore.getState().setProfile('me', 'Me');

    expect(useFriendsStore.getState().friends).toEqual(data.friends);
  });

  it('setLoadError records the error for the rider shown only', () => {
    signIn('rider-me');
    useFriendsStore.getState().setLoadError('rider-me', 'offline');
    expect(useFriendsStore.getState().loadError).toBe('offline');

    useFriendsStore.getState().setLoadError('someone-else', 'boom');
    expect(useFriendsStore.getState().loadError).toBe('offline');
  });
});
