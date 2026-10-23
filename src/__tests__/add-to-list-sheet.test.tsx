import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useHitListsStore } from '@/src/stores';
import { createTestHitList } from './factories';

const mockCreateList = jest.fn();
const mockAddSpotsToList = jest.fn();
const mockRemoveSpotFromList = jest.fn();
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

  it('shows every live manual list by name, checked when the spot is in it', () => {
    const area = createTestHitList({ id: 'L-area', name: 'Area', kind: 'area' });
    const gone = createTestHitList({ id: 'L-gone', name: 'Gone', deleted_at: '2026-10-02T12:00:00.000Z' });
    useHitListsStore.setState({ lists: [downtown, bridges, area, gone] });
    render(<AddToListSheet visible spotIds={['a']} onClose={jest.fn()} />);

    expect(screen.getByText('Add to hit list')).toBeOnTheScreen();
    expect(screen.getAllByRole('checkbox').map((r) => r.props.accessibilityLabel)).toEqual(['Bridges', 'Downtown']);
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
});
