import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useHitListsStore, useSpotsStore } from '@/src/stores';
import { useSettingsStore } from '@/src/stores/settings-store';
import { SIGNED_OUT, useAuthStore } from '@/src/stores/auth-store';
import { UnitSystem, type GeoPoint, type HitList } from '@/src/types';
import { CITIES, createTestHitList, createTestSpot } from './factories';

// createList is held open by a test that double-taps Create; the others resolve at once.
let finishCreate: (list: HitList) => void = () => {};
const mockCreateList = jest.fn(
  (name: string) =>
    new Promise<HitList>((resolve) => {
      finishCreate = resolve;
      void name;
    }),
);
jest.mock('@/src/hooks/use-hit-list-actions', () => ({
  useHitListActions: () => ({
    createList: mockCreateList,
    renameList: jest.fn(),
    deleteList: jest.fn(),
    addSpotsToList: jest.fn(),
    removeSpotFromList: jest.fn(),
  }),
}));

let mockFake: FakeSupabase | null = null;
jest.mock('@/src/sync/client', () => ({
  getSupabase: () => mockFake,
  isConfigured: () => mockFake !== null,
}));
// The calls are src/sync/lists.ts's (sync-lists.test.ts); here only what the tab asks of them (S8-06).
jest.mock('@/src/sync/lists', () => ({
  ...jest.requireActual('@/src/sync/lists'),
  respondInvite: jest.fn().mockResolvedValue(true),
}));
jest.mock('@/src/sync/engine', () => ({ syncNow: jest.fn().mockResolvedValue(undefined) }));

import ListsScreen from '@/app/(tabs)/lists';
import { useSQLiteContext as sharedDb } from 'expo-sqlite';
import { useInboxStore, type InboxItem } from '@/src/stores/inbox-store';
import { clearToast, useToastStore } from '@/src/stores/toast-store';
import { syncNow } from '@/src/sync/engine';
import { NotAllowedError, respondInvite } from '@/src/sync/lists';
import { createFakeSupabase, fakeSession, type FakeSupabase } from './helpers/fake-supabase';

const mockPush = jest.fn();

const downtown = createTestHitList({ id: 'L-downtown', name: 'Downtown' });
const bridges = createTestHitList({ id: 'L-bridges', name: 'Bridges' });
const [a, b, c] = ['a', 'b', 'c'].map((id) => createTestSpot({ id, name: `Spot ${id}` }));
const gone = createTestSpot({ id: 'gone', name: 'Gone spot', deleted_at: '2026-10-02T12:00:00.000Z' });

afterEach(() => jest.restoreAllMocks());

beforeEach(() => {
  mockCreateList.mockClear();
  mockPush.mockClear();
  jest.mocked(useRouter).mockReturnValue({ push: mockPush, back: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() } as never);
  useSpotsStore.setState({ spots: [] });
  useHitListsStore.setState({ lists: [], membershipBySpot: {}, activeListId: null });
});

function seedTwoLists() {
  useSpotsStore.setState({ spots: [a, b, c, gone] });
  useHitListsStore.setState({
    lists: [downtown, bridges],
    membershipBySpot: { a: [downtown.id], b: [downtown.id], c: [downtown.id], gone: [downtown.id] },
  });
}

describe('Lists tab', () => {
  it('shows the empty state when there are no lists', () => {
    render(<ListsScreen />);

    expect(screen.getByText('No hit lists yet')).toBeTruthy();
    expect(screen.getByText('Group spots you mean to hit: by hand, or by area')).toBeTruthy();
    expect(screen.queryByText('My hit lists')).toBeNull();
    // The top button is the only 'New hit list' action.
    expect(screen.getAllByLabelText('New hit list')).toHaveLength(1);
  });

  it("lists 'My hit lists' by name with live spot counts", () => {
    seedTwoLists();
    render(<ListsScreen />);

    expect(screen.getByText('My hit lists')).toBeTruthy();
    expect(screen.getByLabelText('Downtown, 3 spots')).toBeTruthy();
    expect(screen.getByLabelText('Bridges, 0 spots')).toBeTruthy();
    expect(screen.getByText('3 spots')).toBeTruthy();
    expect(screen.getByText('0 spots')).toBeTruthy();
    expect(screen.queryByText('No hit lists yet')).toBeNull();
    // Name order: Bridges before Downtown.
    const names = screen.getAllByText(/^(Bridges|Downtown)$/).map((n) => n.props.children);
    expect(names).toEqual(['Bridges', 'Downtown']);
  });

  it('orders names case-insensitively', () => {
    const lower = createTestHitList({ id: 'L-alley', name: 'alley' });
    useHitListsStore.setState({ lists: [downtown, lower, bridges] });
    render(<ListsScreen />);

    const names = screen.getAllByText(/^(alley|Bridges|Downtown)$/).map((n) => n.props.children);
    expect(names).toEqual(['alley', 'Bridges', 'Downtown']);
  });

  it('updates a count when a spot joins or leaves the list', () => {
    seedTwoLists();
    render(<ListsScreen />);

    act(() => useHitListsStore.getState().addMemberships(bridges.id, ['a']));
    expect(screen.getByLabelText('Bridges, 1 spot')).toBeTruthy();

    act(() => useSpotsStore.setState({ spots: [b, c, gone] }));
    expect(screen.getByLabelText('Downtown, 2 spots')).toBeTruthy();
    expect(screen.getByLabelText('Bridges, 0 spots')).toBeTruthy();
  });

  it('shows the empty state when every list in the store is deleted', () => {
    useHitListsStore.setState({ lists: [createTestHitList({ deleted_at: '2026-10-02T12:00:00.000Z' })] });
    render(<ListsScreen />);

    expect(screen.getByText('No hit lists yet')).toBeTruthy();
    expect(screen.queryByText('My hit lists')).toBeNull();
  });

  it("says '1 spot' for a list of one", () => {
    useSpotsStore.setState({ spots: [a] });
    useHitListsStore.setState({ lists: [downtown], membershipBySpot: { a: [downtown.id] } });
    render(<ListsScreen />);

    expect(screen.getByText('1 spot')).toBeTruthy();
  });

  it("has no 'Shared with me' section without others' lists", () => {
    seedTwoLists();
    render(<ListsScreen />);

    expect(screen.queryByText('Shared with me')).toBeNull();
  });

  describe('shared lists (S8-05)', () => {
    const ME = 'u-me';
    const joined = (user_id: string, username: string, role: 'add' | 'view' = 'add') =>
      ({ user_id, username, role, status: 'member' }) as const;
    // Mine, shared with ana and ben (joined) and cal (invited, not counted, D84).
    const mineShared = createTestHitList({
      id: 'L-mine',
      name: 'Downtown',
      owner_id: ME,
      shared: true,
      members: [joined('u-ana', 'ana'), joined('u-ben', 'ben'), { user_id: 'u-cal', username: 'cal', role: 'add', status: 'invited' }],
    });
    const minePrivate = createTestHitList({ id: 'L-private', name: 'Bridges', owner_id: ME });
    // Ana's, which I joined: four with ana.
    const anas = createTestHitList({
      id: 'L-anas',
      name: 'Waterfront',
      owner_id: 'u-ana',
      owner_username: 'ana',
      shared: true,
      members: [joined(ME, 'me', 'view'), joined('u-ben', 'ben'), joined('u-dan', 'dan')],
    });
    const hers = [1, 2].map((i) => createTestSpot({ id: `h${i}`, name: `Hers ${i}`, owner_id: 'u-ana' }));

    beforeEach(() => {
      useAuthStore.setState({ status: 'signed_in', userId: ME, username: 'me' });
      useSpotsStore.setState({ spots: hers });
      useHitListsStore.setState({
        lists: [mineShared, minePrivate, anas],
        membershipBySpot: { h1: [anas.id], h2: [anas.id] },
      });
    });
    afterEach(() => act(() => useAuthStore.setState(SIGNED_OUT)));

    it("a shared list of mine carries the two-people icon and the member count; a private one doesn't", () => {
      render(<ListsScreen />);

      const shared = screen.getByLabelText('Downtown, 0 spots, Shared with 3');
      expect(within(shared).getByTestId('icon-person.2.fill')).toBeTruthy();
      expect(within(shared).getByText('3')).toBeTruthy();
      const priv = screen.getByLabelText('Bridges, 0 spots');
      expect(within(priv).queryByTestId('icon-person.2.fill')).toBeNull();
    });

    it("lists others' lists under 'Shared with me' with '@ana · 2 spots', the icon and the count, not under mine", () => {
      render(<ListsScreen />);

      const headers = screen.getAllByRole('header').map((h) => h.props.children);
      expect(headers).toEqual(['My hit lists', 'Shared with me']);
      const row = screen.getByLabelText('Waterfront, @ana · 2 spots, Shared with 4');
      expect(within(row).getByText('@ana · 2 spots')).toBeTruthy();
      expect(within(row).getByTestId('icon-person.2.fill')).toBeTruthy();
      expect(within(row).getByText('4')).toBeTruthy();
      // Mine first, then theirs: Waterfront isn't in 'My hit lists'.
      const names = screen.getAllByText(/^(Bridges|Downtown|Waterfront)$/).map((n) => n.props.children);
      expect(names).toEqual(['Bridges', 'Downtown', 'Waterfront']);
    });

    it("a shared list's row opens it", () => {
      render(<ListsScreen />);

      fireEvent.press(screen.getByLabelText('Waterfront, @ana · 2 spots, Shared with 4'));
      expect(mockPush).toHaveBeenCalledWith('/list/L-anas');
    });

    it("an owner whose name isn't mirrored yet reads 'A friend'", () => {
      useHitListsStore.setState({ lists: [{ ...anas, owner_username: undefined }] });
      render(<ListsScreen />);

      expect(screen.getByText('A friend · 2 spots')).toBeTruthy();
    });

    it("an invitation isn't a joined list: no 'Shared with me' row until Join", () => {
      const invited = { ...anas, members: [{ user_id: ME, role: 'add' as const, status: 'invited' as const }] };
      useHitListsStore.setState({ lists: [minePrivate, invited] });
      render(<ListsScreen />);

      expect(screen.queryByText('Shared with me')).toBeNull();
      expect(screen.queryByText('Waterfront')).toBeNull();
    });
  });

  describe('invitations (S8-06)', () => {
    const ME = 'u-me';
    const db = sharedDb();
    const INVITE: InboxItem = {
      kind: 'invite',
      id: 'L-anas',
      created_at: '2026-10-23T09:00:00.000Z',
      listId: 'L-anas',
      listName: 'Waterfront',
      listKind: 'manual',
      from: { id: 'u-ana', username: 'ana', display_name: null },
      role: 'add',
      spotCount: 12,
    };
    let alert: jest.SpyInstance;

    const signIn = () => {
      mockFake = createFakeSupabase();
      mockFake.setSession(fakeSession({ userId: ME }));
      useAuthStore.setState({ status: 'signed_in', userId: ME, username: 'me' });
      useInboxStore.setState({ userId: ME, items: [INVITE], seenAt: null });
    };

    beforeEach(() => {
      alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      jest.mocked(respondInvite).mockReset().mockResolvedValue(true);
      jest.mocked(syncNow).mockReset().mockResolvedValue(undefined);
    });
    afterEach(() => {
      act(() => {
        useAuthStore.setState(SIGNED_OUT);
        useInboxStore.getState().clearInbox();
        clearToast();
      });
      mockFake = null;
    });

    it("shows an invitation under 'Shared with me' with '@ana invited you · 12 spots' and a Join chip", () => {
      signIn();
      seedTwoLists();
      render(<ListsScreen />);

      const headers = screen.getAllByRole('header').map((h) => h.props.children);
      expect(headers).toEqual(['My hit lists', 'Shared with me']);
      const row = screen.getByLabelText('Waterfront, @ana invited you · 12 spots');
      expect(within(row).getByText('Waterfront')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Join Waterfront' })).toBeTruthy();
    });

    it("an invitation alone still shows: the 'Shared with me' section, no empty state", () => {
      signIn();
      render(<ListsScreen />);

      expect(screen.getByText('Shared with me')).toBeTruthy();
      expect(screen.queryByText('No hit lists yet')).toBeNull();
    });

    it("Join calls respondInvite then syncNow, toasts 'Joined Waterfront' and the row leaves", async () => {
      signIn();
      render(<ListsScreen />);

      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Join Waterfront' }));
      });

      expect(respondInvite).toHaveBeenCalledWith(db, mockFake, ME, 'L-anas', 'join');
      expect(syncNow).toHaveBeenCalledWith(db);
      expect(jest.mocked(respondInvite).mock.invocationCallOrder[0]).toBeLessThan(
        jest.mocked(syncNow).mock.invocationCallOrder[0],
      );
      expect(useToastStore.getState().text).toBe('Joined Waterfront');
      expect(screen.queryByLabelText('Waterfront, @ana invited you · 12 spots')).toBeNull();
    });

    it('a double tap on Join joins once, with a spinner meanwhile', async () => {
      signIn();
      let finish: (v: boolean) => void = () => {};
      jest.mocked(respondInvite).mockImplementation(() => new Promise((resolve) => (finish = resolve)));
      render(<ListsScreen />);

      const join = screen.getByRole('button', { name: 'Join Waterfront' });
      await act(async () => {
        fireEvent.press(join);
        fireEvent.press(join);
      });
      expect(screen.getByLabelText('Joining')).toBeTruthy();
      await act(async () => finish(true));

      expect(respondInvite).toHaveBeenCalledTimes(1);
    });

    it("a withdrawn invitation toasts 'This invitation was withdrawn.'; a failed one alerts and keeps the row", async () => {
      signIn();
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      jest.mocked(respondInvite).mockRejectedValueOnce(new Error('offline'));
      render(<ListsScreen />);

      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Join Waterfront' }));
      });
      expect(alert).toHaveBeenLastCalledWith("Couldn't reach the server", 'Try again.');
      expect(warn).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Join Waterfront' })).toBeTruthy();

      jest.mocked(respondInvite).mockRejectedValueOnce(new NotAllowedError('This invitation was withdrawn.'));
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Join Waterfront' }));
      });
      expect(useToastStore.getState().text).toBe('This invitation was withdrawn.');
      expect(screen.queryByRole('button', { name: 'Join Waterfront' })).toBeNull();
      expect(syncNow).not.toHaveBeenCalled();
    });

    it('signed out, no invitation row shows', () => {
      useInboxStore.setState({ userId: ME, items: [INVITE], seenAt: null });
      seedTwoLists();
      render(<ListsScreen />);

      expect(screen.queryByText('Shared with me')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Join Waterfront' })).toBeNull();
    });
  });

  it('opens the list screen when a row is pressed', () => {
    seedTwoLists();
    render(<ListsScreen />);

    fireEvent.press(screen.getByLabelText('Downtown, 3 spots'));
    expect(mockPush).toHaveBeenCalledWith('/list/L-downtown');
  });

  it('names and creates a list, then opens it', async () => {
    render(<ListsScreen />);

    fireEvent.press(screen.getByLabelText('New hit list'));
    expect(screen.getByPlaceholderText('Name')).toBeTruthy();
    expect(screen.getByLabelText('Create')).toBeDisabled();

    fireEvent.changeText(screen.getByLabelText('List name'), '   ');
    expect(screen.getByLabelText('Create')).toBeDisabled();

    fireEvent.changeText(screen.getByLabelText('List name'), '  Downtown  ');
    expect(screen.getByLabelText('Create')).toBeEnabled();
    fireEvent.press(screen.getByLabelText('Create'));
    expect(mockCreateList).toHaveBeenCalledWith('Downtown');

    await act(async () => finishCreate(createTestHitList({ id: 'L-new', name: 'Downtown' })));
    expect(mockPush).toHaveBeenCalledWith('/list/L-new');
    expect(screen.queryByPlaceholderText('Name')).toBeNull();
  });

  it('creates one list on a double tap of Create', async () => {
    render(<ListsScreen />);

    fireEvent.press(screen.getByLabelText('New hit list'));
    fireEvent.changeText(screen.getByLabelText('List name'), 'Downtown');
    fireEvent.press(screen.getByLabelText('Create'));
    fireEvent.press(screen.getByLabelText('Create'));
    expect(mockCreateList).toHaveBeenCalledTimes(1);

    await act(async () => finishCreate(createTestHitList({ id: 'L-new' })));
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('Cancel closes the sheet without creating, and the next open starts empty', () => {
    render(<ListsScreen />);

    fireEvent.press(screen.getByLabelText('New hit list'));
    fireEvent.changeText(screen.getByLabelText('List name'), 'Half typed');
    fireEvent.press(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText('Name')).toBeNull();
    expect(mockCreateList).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('New hit list'));
    expect(screen.getByLabelText('List name').props.value).toBe('');
  });

  it('keeps the sheet open and says so when the list cannot be created', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockCreateList.mockRejectedValueOnce(new Error('disk full'));
    render(<ListsScreen />);

    fireEvent.press(screen.getByLabelText('New hit list'));
    fireEvent.changeText(screen.getByLabelText('List name'), 'Downtown');
    await act(async () => fireEvent.press(screen.getByLabelText('Create')));

    expect(alert).toHaveBeenCalledWith("Couldn't create the list", 'Please try again.');
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByLabelText('List name').props.value).toBe('Downtown');
    expect(screen.getByLabelText('Create')).toBeEnabled();
  });

  it('creates one list when Return and Create land in the same tick', async () => {
    render(<ListsScreen />);

    fireEvent.press(screen.getByLabelText('New hit list'));
    fireEvent.changeText(screen.getByLabelText('List name'), 'Downtown');
    act(() => {
      fireEvent(screen.getByLabelText('List name'), 'submitEditing');
      fireEvent.press(screen.getByLabelText('Create'));
    });
    expect(mockCreateList).toHaveBeenCalledTimes(1);

    await act(async () => finishCreate(createTestHitList({ id: 'L-new' })));
  });

  it('ignores Return while the name is blank', () => {
    render(<ListsScreen />);

    fireEvent.press(screen.getByLabelText('New hit list'));
    fireEvent.changeText(screen.getByLabelText('List name'), '  ');
    fireEvent(screen.getByLabelText('List name'), 'submitEditing');
    expect(mockCreateList).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Name')).toBeTruthy();
  });

  it('cannot be cancelled while Create is running', async () => {
    render(<ListsScreen />);

    fireEvent.press(screen.getByLabelText('New hit list'));
    fireEvent.changeText(screen.getByLabelText('List name'), 'Downtown');
    fireEvent.press(screen.getByLabelText('Create'));

    expect(screen.getByLabelText('Cancel')).toBeDisabled();
    fireEvent(screen.getByTestId('name-list-sheet-modal'), 'requestClose');
    expect(screen.getByPlaceholderText('Name')).toBeTruthy();

    await act(async () => finishCreate(createTestHitList({ id: 'L-new' })));
    expect(mockPush).toHaveBeenCalledWith('/list/L-new');
    expect(screen.queryByPlaceholderText('Name')).toBeNull();
  });

  describe('area lists (S2-04)', () => {
    /** A point `meters` due north of `p` (haversine's Earth: 6371 km). */
    const north = (p: GeoPoint, meters: number): GeoPoint => ({
      latitude: p.latitude + (meters / 6_371_000) * (180 / Math.PI),
      longitude: p.longitude,
    });
    const weekend = createTestHitList({
      id: 'L-weekend',
      name: 'Weekend',
      kind: 'area',
      area_center: CITIES.seattle,
      area_radius_m: 3219,
      area_place: 'Capitol Hill',
    });

    beforeEach(() => {
      useSettingsStore.setState({ units: UnitSystem.Imperial });
    });

    it("'+ Area list' opens the area picker", () => {
      render(<ListsScreen />);

      expect(screen.getByText('Area list')).toBeTruthy();
      fireEvent.press(screen.getByRole('button', { name: 'New area list' }));
      expect(mockPush).toHaveBeenCalledWith('/area');
    });

    it("an area list's row shows 'Area · 2 mi' and the live count of the spots inside its circle", () => {
      useSpotsStore.setState({
        spots: [
          createTestSpot({ id: 'in-1', location: north(CITIES.seattle, 100) }),
          createTestSpot({ id: 'in-2', location: north(CITIES.seattle, 3000) }),
          createTestSpot({ id: 'out', location: north(CITIES.seattle, 3300) }),
        ],
      });
      useHitListsStore.setState({ lists: [weekend, downtown] });
      render(<ListsScreen />);

      expect(screen.getByText('Area · 2 mi')).toBeTruthy();
      expect(screen.queryByText(/Capitol Hill/)).toBeNull();
      expect(screen.getByText('2 spots')).toBeTruthy();
      fireEvent.press(screen.getByLabelText('Weekend, Area · 2 mi, 2 spots'));
      expect(mockPush).toHaveBeenCalledWith('/list/L-weekend');
      // A manual row keeps its one line.
      expect(screen.getByLabelText('Downtown, 0 spots')).toBeTruthy();
    });

    it('counts a spot saved inside the circle on the next render', () => {
      useHitListsStore.setState({ lists: [weekend] });
      render(<ListsScreen />);
      expect(screen.getByLabelText('Weekend, Area · 2 mi, 0 spots')).toBeTruthy();

      act(() => useSpotsStore.setState({ spots: [createTestSpot({ id: 'new', location: CITIES.seattle })] }));

      expect(screen.getByLabelText('Weekend, Area · 2 mi, 1 spot')).toBeTruthy();
    });

    it("labels the radius in the rider's units", () => {
      useSettingsStore.setState({ units: UnitSystem.Metric });
      useHitListsStore.setState({ lists: [weekend] });
      render(<ListsScreen />);

      expect(screen.getByText('Area · 3.2 km')).toBeTruthy();
    });
  });
});
