import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getSyncState } from '@/src/db/sync';
import { SIGNED_OUT, useAuthStore } from '@/src/stores/auth-store';
import type { AlertButton } from 'react-native';
import { createMigratedTestDb } from './helpers/node-sqlite-db';
import { Alert } from 'react-native';
import { useHitListsStore, useSpotsStore } from '@/src/stores';
import { CITIES, createTestHitList, createTestSpot } from './factories';

const mockCreateList = jest.fn();
const mockAddSpotsToList = jest.fn();
const mockRemoveSpotFromList = jest.fn();
let mockDb: SQLiteDatabase;
jest.mock('expo-sqlite', () => ({
  ...jest.requireActual('expo-sqlite'),
  useSQLiteContext: () => mockDb,
}));
jest.mock('@/src/hooks/use-hit-list-actions', () => ({
  useHitListActions: () => ({
    createList: mockCreateList,
    renameList: jest.fn(),
    deleteList: jest.fn(),
    addSpotsToList: mockAddSpotsToList,
    removeSpotFromList: mockRemoveSpotFromList,
  }),
}));

import { AddToListSheet } from '@/src/components/AddToListSheet';

const downtown = createTestHitList({ id: 'L-downtown', name: 'Downtown' });
const bridges = createTestHitList({ id: 'L-bridges', name: 'Bridges' });

afterEach(() => jest.restoreAllMocks());

beforeEach(() => {
  mockCreateList.mockReset();
  mockAddSpotsToList.mockReset().mockResolvedValue(undefined);
  mockRemoveSpotFromList.mockReset().mockResolvedValue(undefined);
  useHitListsStore.setState({
    lists: [downtown, bridges],
    membershipBySpot: { a: [downtown.id] },
    activeListId: null,
  });
});

const row = (name: string) => screen.getByRole('checkbox', { name });

describe('AddToListSheet', () => {
  it('renders nothing while hidden', () => {
    render(<AddToListSheet visible={false} spotIds={['a']} onClose={jest.fn()} />);

    expect(screen.queryByText('Add to hit list')).toBeNull();
  });

  it('shows every live list by name, checked when the spot is in it', () => {
    const area = createTestHitList({ id: 'L-area', name: 'Area', kind: 'area' });
    const gone = createTestHitList({ id: 'L-gone', name: 'Gone', deleted_at: '2026-10-02T12:00:00.000Z' });
    useHitListsStore.setState({ lists: [downtown, bridges, area, gone] });
    render(<AddToListSheet visible spotIds={['a']} onClose={jest.fn()} />);

    expect(screen.getByText('Add to hit list')).toBeOnTheScreen();
    expect(screen.getAllByRole('checkbox').map((r) => r.props.accessibilityLabel)).toEqual([
      'Area',
      'Bridges',
      'Downtown',
    ]);
    expect(row('Downtown').props.accessibilityState).toEqual({ checked: true });
    expect(row('Bridges').props.accessibilityState).toEqual({ checked: false });
  });

  it('adds the spot when an unchecked list is toggled', () => {
    render(<AddToListSheet visible spotIds={['a']} onClose={jest.fn()} />);

    fireEvent.press(row('Bridges'));

    expect(mockAddSpotsToList).toHaveBeenCalledWith(bridges.id, ['a']);
    expect(mockRemoveSpotFromList).not.toHaveBeenCalled();
  });

  it('removes the spot when a checked list is toggled', () => {
    render(<AddToListSheet visible spotIds={['a']} onClose={jest.fn()} />);

    fireEvent.press(row('Downtown'));

    expect(mockRemoveSpotFromList).toHaveBeenCalledWith(downtown.id, 'a');
    expect(mockAddSpotsToList).not.toHaveBeenCalled();
  });

  it('shows a list as unchecked unless every given spot is in it, and toggling adds them all', () => {
    render(<AddToListSheet visible spotIds={['a', 'b']} onClose={jest.fn()} />);

    expect(row('Downtown').props.accessibilityState).toEqual({ checked: false });
    fireEvent.press(row('Downtown'));

    expect(mockAddSpotsToList).toHaveBeenCalledWith(downtown.id, ['a', 'b']);
  });

  it('removes every given spot when a list holding all of them is toggled', () => {
    useHitListsStore.setState({ membershipBySpot: { a: [downtown.id], b: [downtown.id] } });
    render(<AddToListSheet visible spotIds={['a', 'b']} onClose={jest.fn()} />);

    fireEvent.press(row('Downtown'));

    expect(mockRemoveSpotFromList.mock.calls).toEqual([
      [downtown.id, 'a'],
      [downtown.id, 'b'],
    ]);
  });

  it('follows the store, so a toggle shows at once', () => {
    render(<AddToListSheet visible spotIds={['a']} onClose={jest.fn()} />);

    act(() => useHitListsStore.getState().addMemberships(bridges.id, ['a']));

    expect(row('Bridges').props.accessibilityState).toEqual({ checked: true });
  });

  it('shows no list as checked when given no spots', () => {
    render(<AddToListSheet visible spotIds={[]} onClose={jest.fn()} />);

    expect(row('Downtown').props.accessibilityState).toEqual({ checked: false });
    expect(row('Bridges').props.accessibilityState).toEqual({ checked: false });
  });

  it('alerts when an add fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockAddSpotsToList.mockRejectedValue(new Error('disk full'));
    render(<AddToListSheet visible spotIds={['a']} onClose={jest.fn()} />);

    await act(async () => fireEvent.press(row('Bridges')));

    expect(alert).toHaveBeenCalledWith("Couldn't update the list", 'Please try again.');
  });

  it('alerts once when a toggle fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    useHitListsStore.setState({ membershipBySpot: { a: [downtown.id], b: [downtown.id] } });
    mockRemoveSpotFromList.mockRejectedValue(new Error('disk full'));
    render(<AddToListSheet visible spotIds={['a', 'b']} onClose={jest.fn()} />);

    await act(async () => fireEvent.press(row('Downtown')));

    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith("Couldn't update the list", 'Please try again.');
  });

  it("'+ New hit list' names a list, creates it and adds the spots to it", async () => {
    const made = createTestHitList({ id: 'L-new', name: 'Night mission' });
    mockCreateList.mockResolvedValue(made);
    render(<AddToListSheet visible spotIds={['a', 'b']} onClose={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'New hit list' }));
    expect(screen.getByRole('header', { name: 'New hit list' })).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('List name'), '  Night mission ');
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Create' })));

    expect(mockCreateList).toHaveBeenCalledWith('Night mission');
    expect(mockAddSpotsToList).toHaveBeenCalledWith(made.id, ['a', 'b']);
    expect(screen.queryByLabelText('List name')).toBeNull();
  });

  it('keeps the name sheet open and alerts when the create fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockCreateList.mockRejectedValue(new Error('disk full'));
    render(<AddToListSheet visible spotIds={['a']} onClose={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'New hit list' }));
    fireEvent.changeText(screen.getByLabelText('List name'), 'Night mission');
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Create' })));

    expect(alert).toHaveBeenCalledWith("Couldn't create the list", 'Please try again.');
    expect(mockAddSpotsToList).not.toHaveBeenCalled();
    expect(screen.getByLabelText('List name')).toBeOnTheScreen();
  });

  it('closes the name sheet and alerts when the list is made but the add fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockCreateList.mockResolvedValue(createTestHitList({ id: 'L-new', name: 'Night mission' }));
    mockAddSpotsToList.mockRejectedValue(new Error('disk full'));
    render(<AddToListSheet visible spotIds={['a']} onClose={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'New hit list' }));
    fireEvent.changeText(screen.getByLabelText('List name'), 'Night mission');
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Create' })));

    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith("Couldn't update the list", 'Please try again.');
    expect(screen.queryByLabelText('List name')).toBeNull();
  });

  it('Cancel on the name sheet goes back to the lists', () => {
    render(<AddToListSheet visible spotIds={['a']} onClose={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'New hit list' }));
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('List name')).toBeNull();
    expect(mockCreateList).not.toHaveBeenCalled();
    expect(row('Downtown')).toBeOnTheScreen();
  });

  it('Done closes the sheet', () => {
    const onClose = jest.fn();
    render(<AddToListSheet visible spotIds={['a']} onClose={onClose} />);

    fireEvent.press(screen.getByRole('button', { name: 'Done' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('area lists (S2-04)', () => {
    const HINT = 'Area list: spots inside its circle are in it automatically';
    const weekend = createTestHitList({
      id: 'L-weekend',
      name: 'Weekend',
      kind: 'area',
      area_center: CITIES.seattle,
      area_radius_m: 1609,
    });

    beforeEach(() => {
      useSpotsStore.setState({
        spots: [
          createTestSpot({ id: 'a', location: CITIES.seattle }),
          createTestSpot({ id: 'b', location: CITIES.seattle }),
          createTestSpot({ id: 'far', location: CITIES.portland }),
        ],
      });
      useHitListsStore.setState({ lists: [downtown, weekend], membershipBySpot: {} });
    });

    it('shows an area list as a disabled row with its hint', () => {
      render(<AddToListSheet visible spotIds={['far']} onClose={jest.fn()} />);

      expect(row('Weekend').props.accessibilityState).toEqual({ disabled: true, checked: false });
      expect(screen.getByText(HINT)).toBeTruthy();
      expect(row('Downtown').props.accessibilityState).toEqual({ checked: false });
    });

    it('checks it when every given spot is inside its circle', () => {
      render(<AddToListSheet visible spotIds={['a', 'b']} onClose={jest.fn()} />);

      expect(row('Weekend').props.accessibilityState).toEqual({ disabled: true, checked: true });
    });

    it('leaves it unchecked when one given spot is outside', () => {
      render(<AddToListSheet visible spotIds={['a', 'far']} onClose={jest.fn()} />);

      expect(row('Weekend').props.accessibilityState).toEqual({ disabled: true, checked: false });
    });

    it('never writes when its row is pressed', () => {
      render(<AddToListSheet visible spotIds={['far']} onClose={jest.fn()} />);

      fireEvent.press(row('Weekend'));
      fireEvent.press(screen.getByText(HINT));

      expect(mockAddSpotsToList).not.toHaveBeenCalled();
      expect(mockRemoveSpotFromList).not.toHaveBeenCalled();
    });
  });
  describe('shared lists (S8-05)', () => {
    const ME = 'u-me';
    const joined = (user_id: string, role: 'add' | 'view' = 'add') => ({ user_id, role, status: 'member' }) as const;
    // Mine, shared: ana, ben and cal joined, dan invited (not counted, D84) → 'Downtown (4)'.
    const mineShared = createTestHitList({
      id: 'L-mine',
      name: 'Downtown',
      owner_id: ME,
      shared: true,
      members: [joined('u-ana'), joined('u-ben'), joined('u-cal'), { user_id: 'u-dan', role: 'add', status: 'invited' }],
    });
    const minePrivate = createTestHitList({ id: 'L-private', name: 'Bridges', owner_id: ME });
    const anasAdd = createTestHitList({
      id: 'L-anas-add',
      name: 'Waterfront',
      owner_id: 'u-ana',
      shared: true,
      members: [joined(ME, 'add')],
    });
    const anasView = createTestHitList({
      id: 'L-anas-view',
      name: 'Rooftops',
      owner_id: 'u-ana',
      shared: true,
      members: [joined(ME, 'view'), joined('u-ben')],
    });
    const anasArea = createTestHitList({
      id: 'L-anas-area',
      name: 'Weekend',
      kind: 'area',
      area_center: CITIES.seattle,
      area_radius_m: 1609,
      owner_id: 'u-ana',
      shared: true,
      members: [joined(ME, 'add')],
    });
    const AREA_HINT = 'Area list: spots inside its circle are in it automatically';

    let alert: jest.SpyInstance;
    const alertButtons = () => (alert.mock.lastCall?.[2] ?? []) as AlertButton[];
    const press = (text: string) => alertButtons().find((b) => b.text === text)?.onPress?.();

    beforeEach(async () => {
      mockDb = await createMigratedTestDb();
      alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      useAuthStore.setState({ status: 'signed_in', userId: ME, username: 'me' });
      useSpotsStore.setState({
        spots: ['a', 'b', 'c'].map((id) => createTestSpot({ id, owner_id: ME, location: CITIES.portland })),
      });
      useHitListsStore.setState({
        lists: [mineShared, minePrivate, anasAdd, anasView, anasArea],
        membershipBySpot: {},
      });
    });
    afterEach(() => act(() => useAuthStore.setState(SIGNED_OUT)));

    it('a shared row carries the two-people icon and the member count; a private one has neither', () => {
      render(<AddToListSheet visible spotIds={['a']} onClose={jest.fn()} />);

      const shared = row('Downtown, Shared with 4');
      expect(within(shared).getByTestId('icon-person.2.fill')).toBeTruthy();
      expect(within(shared).getByText('4')).toBeTruthy();
      expect(within(row('Bridges')).queryByTestId('icon-person.2.fill')).toBeNull();
    });

    it("enables a shared list I own and one where my role is 'add'", () => {
      render(<AddToListSheet visible spotIds={['a']} onClose={jest.fn()} />);

      expect(row('Downtown, Shared with 4').props.accessibilityState).toEqual({ checked: false });
      expect(row('Waterfront, Shared with 2').props.accessibilityState).toEqual({ checked: false });
    });

    it("disables a shared list where my role is 'view', with the hint 'View only', and never writes to it", () => {
      render(<AddToListSheet visible spotIds={['a']} onClose={jest.fn()} />);

      const viewOnly = row('Rooftops, Shared with 3');
      expect(viewOnly.props.accessibilityState).toEqual({ disabled: true, checked: false });
      expect(viewOnly.props.accessibilityHint).toBe('View only');
      expect(within(viewOnly).getByText('View only')).toBeTruthy();
      fireEvent.press(viewOnly);
      expect(alert).not.toHaveBeenCalled();
      expect(mockAddSpotsToList).not.toHaveBeenCalled();
    });

    it("disables a shared area list with the area hint (members can't add, D41)", () => {
      render(<AddToListSheet visible spotIds={['a']} onClose={jest.fn()} />);

      const area = row('Weekend, Shared with 2');
      expect(area.props.accessibilityState).toEqual({ disabled: true, checked: false });
      expect(within(area).getByText(AREA_HINT)).toBeTruthy();
      expect(within(area).getByTestId('icon-person.2.fill')).toBeTruthy();
    });

    it("the first add to a shared list asks 'Everyone in Downtown (4) will see this spot.' with Cancel / Add", async () => {
      render(<AddToListSheet visible spotIds={['a']} onClose={jest.fn()} />);

      fireEvent.press(row('Downtown, Shared with 4'));

      await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
      expect(alert.mock.lastCall?.[0]).toBe('Everyone in Downtown (4) will see this spot.');
      expect(alert.mock.lastCall?.[1]).toBeUndefined();
      expect(alertButtons().map((b) => [b.text, b.style])).toEqual([
        ['Cancel', 'cancel'],
        ['Add', undefined],
      ]);
      expect(mockAddSpotsToList).not.toHaveBeenCalled();
    });

    it("says 'these 3 spots' for three", async () => {
      render(<AddToListSheet visible spotIds={['a', 'b', 'c']} onClose={jest.fn()} />);

      fireEvent.press(row('Downtown, Shared with 4'));

      await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
      expect(alert.mock.lastCall?.[0]).toBe('Everyone in Downtown (4) will see these 3 spots.');
    });

    it('Cancel adds nothing and remembers nothing', async () => {
      render(<AddToListSheet visible spotIds={['a']} onClose={jest.fn()} />);
      fireEvent.press(row('Downtown, Shared with 4'));
      await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));

      await act(async () => press('Cancel'));

      expect(mockAddSpotsToList).not.toHaveBeenCalled();
      expect(await getSyncState(mockDb, 'confirmed_list:L-mine')).toBeUndefined();
    });

    it("Add adds the spots and sets 'confirmed_list:<id>'; the next add to that list asks nothing", async () => {
      render(<AddToListSheet visible spotIds={['a']} onClose={jest.fn()} />);
      fireEvent.press(row('Downtown, Shared with 4'));
      await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));

      await act(async () => press('Add'));

      expect(mockAddSpotsToList).toHaveBeenCalledWith('L-mine', ['a']);
      expect(await getSyncState(mockDb, 'confirmed_list:L-mine')).toBe('1');

      // The mock leaves the row unchecked, so the next press is another add.
      fireEvent.press(row('Downtown, Shared with 4'));
      await waitFor(() => expect(mockAddSpotsToList).toHaveBeenCalledTimes(2));
      expect(alert).toHaveBeenCalledTimes(1);
    });

    it('adding to a different shared list asks again (D90: once per list)', async () => {
      render(<AddToListSheet visible spotIds={['a']} onClose={jest.fn()} />);
      fireEvent.press(row('Downtown, Shared with 4'));
      await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
      await act(async () => press('Add'));

      fireEvent.press(row('Waterfront, Shared with 2'));

      await waitFor(() => expect(alert).toHaveBeenCalledTimes(2));
      expect(alert.mock.lastCall?.[0]).toBe('Everyone in Waterfront (2) will see this spot.');
      expect(mockAddSpotsToList).toHaveBeenCalledTimes(1);
    });

    it('a failed add leaves the list unconfirmed and says so', async () => {
      mockAddSpotsToList.mockRejectedValueOnce(new Error('disk full'));
      render(<AddToListSheet visible spotIds={['a']} onClose={jest.fn()} />);
      fireEvent.press(row('Downtown, Shared with 4'));
      await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));

      await act(async () => press('Add'));

      expect(alert.mock.lastCall?.[0]).toBe("Couldn't update the list");
      expect(await getSyncState(mockDb, 'confirmed_list:L-mine')).toBeUndefined();
    });

    it('removing a spot from a shared list asks nothing', () => {
      useHitListsStore.setState({ membershipBySpot: { a: ['L-mine'] } });
      render(<AddToListSheet visible spotIds={['a']} onClose={jest.fn()} />);

      fireEvent.press(row('Downtown, Shared with 4'));

      expect(mockRemoveSpotFromList).toHaveBeenCalledWith('L-mine', 'a');
      expect(alert).not.toHaveBeenCalled();
    });

    it('a private list adds at once, without asking', () => {
      render(<AddToListSheet visible spotIds={['a']} onClose={jest.fn()} />);

      fireEvent.press(row('Bridges'));

      expect(mockAddSpotsToList).toHaveBeenCalledWith('L-private', ['a']);
      expect(alert).not.toHaveBeenCalled();
    });
  });
});
