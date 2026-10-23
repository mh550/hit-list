import { fireEvent, render, screen } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import { useHitListsStore } from '@/src/stores';
import { createTestHitList } from './factories';

import { ListPickerChips } from '@/src/components/ListPickerChips';

const downtown = createTestHitList({ id: 'L-downtown', name: 'Downtown', created_at: '2026-10-01T12:00:00.000Z' });
const bridges = createTestHitList({ id: 'L-bridges', name: 'bridges', created_at: '2026-10-02T12:00:00.000Z' });
const deleted = createTestHitList({ id: 'L-gone', name: 'Gone list', deleted_at: '2026-10-03T12:00:00.000Z' });

const tabs = () => screen.getAllByRole('tab');
// One test swaps the action for a spy; every test starts with the real one.
const { setActiveListId: realSetActiveListId } = useHitListsStore.getState();

beforeEach(() => {
  useHitListsStore.setState({
    lists: [downtown, bridges],
    membershipBySpot: {},
    activeListId: null,
    setActiveListId: realSetActiveListId,
  });
});

describe('ListPickerChips', () => {
  it("shows 'My spots' then each live list by name, case-insensitive, as tabs", () => {
    useHitListsStore.setState({ lists: [downtown, deleted, bridges] });
    render(<ListPickerChips />);

    expect(tabs()).toHaveLength(3);
    expect(screen.getAllByText(/^(My spots|Downtown|bridges)$/).map((t) => t.props.children)).toEqual([
      'My spots',
      'bridges',
      'Downtown',
    ]);
    expect(screen.queryByText('Gone list')).toBeNull();
  });

  it('groups the chips as a tablist so VoiceOver reads their position', () => {
    render(<ListPickerChips />);

    // The container isn't itself accessible, so getByRole skips it; read the role off the ScrollView.
    expect(screen.UNSAFE_getByType(ScrollView).props.accessibilityRole).toBe('tablist');
  });

  it("selects 'My spots' when no list is active", () => {
    render(<ListPickerChips />);

    expect(screen.getByRole('tab', { name: 'My spots' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByRole('tab', { name: 'Downtown' }).props.accessibilityState).toMatchObject({ selected: false });
  });

  it('selects the active list', () => {
    useHitListsStore.setState({ activeListId: downtown.id });
    render(<ListPickerChips />);

    expect(screen.getByRole('tab', { name: 'Downtown' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByRole('tab', { name: 'My spots' }).props.accessibilityState).toMatchObject({ selected: false });
  });

  it("pressing a list sets it active; pressing 'My spots' clears it", () => {
    const setActiveListId = jest.fn();
    useHitListsStore.setState({ setActiveListId });
    render(<ListPickerChips />);

    fireEvent.press(screen.getByRole('tab', { name: 'Downtown' }));
    expect(setActiveListId).toHaveBeenLastCalledWith(downtown.id);

    fireEvent.press(screen.getByRole('tab', { name: 'My spots' }));
    expect(setActiveListId).toHaveBeenLastCalledWith(null);
  });

  it('updates the selection through the real store', () => {
    render(<ListPickerChips />);

    fireEvent.press(screen.getByRole('tab', { name: 'bridges' }));
    expect(useHitListsStore.getState().activeListId).toBe(bridges.id);
    expect(screen.getByRole('tab', { name: 'bridges' }).props.accessibilityState).toMatchObject({ selected: true });
  });

  it("renders nothing with no lists, not a lone 'My spots' chip", () => {
    useHitListsStore.setState({ lists: [] });
    const { toJSON } = render(<ListPickerChips />);

    expect(toJSON()).toBeNull();
    expect(screen.queryByText('My spots')).toBeNull();
  });

  it('renders nothing when every list is deleted', () => {
    useHitListsStore.setState({ lists: [deleted] });
    const { toJSON } = render(<ListPickerChips />);

    expect(toJSON()).toBeNull();
  });
});
