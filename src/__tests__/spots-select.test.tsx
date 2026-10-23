import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useHitListsStore, useMediaStore, useSpotsStore } from '@/src/stores';
import { useLocationStore } from '@/src/stores/location-store';
import { DEFAULT_FILTERS, SortDirection, SortField } from '@/src/types';
import { AddToListSheet } from '@/src/components/AddToListSheet';
import { createTestHitList, createTestSpot } from './factories';

const mockAddSpotsToList = jest.fn((listId: string, spotIds: string[]): Promise<void> => {
  void listId;
  void spotIds;
  return Promise.resolve();
});
jest.mock('@/src/hooks/use-hit-list-actions', () => ({
  useHitListActions: () => ({
    createList: jest.fn(),
    renameList: jest.fn(),
    deleteList: jest.fn(),
    addSpotsToList: mockAddSpotsToList,
    removeSpotFromList: jest.fn(),
  }),
}));

import SpotsScreen from '@/app/(tabs)/index';

const mockPush = jest.fn();

const a = createTestSpot({ id: 'a', name: 'Alley rail' });
const b = createTestSpot({ id: 'b', name: 'Bank to wall' });
const c = createTestSpot({ id: 'c', name: 'Church ledge' });
const downtown = createTestHitList({ id: 'L-downtown', name: 'Downtown' });

type ScreenOptions = { title?: string; headerTitle?: string; headerLeft?: () => ReactElement | null };
/** Every Stack.Screen's options, merged in render order (as the navigator merges them). */
function headerOptions(): ScreenOptions {
  const screens = screen.UNSAFE_getAllByType('Stack.Screen' as never);
  return Object.assign({}, ...screens.map((s) => (s.props as { options?: ScreenOptions }).options));
}

type ActionProps = { accessibilityLabel?: string; onPress: () => void; children?: ReactNode };
/** The header's left action with this label, read off the headerLeft element (see openRename in list-screen.test). */
function headerAction(label: string): ReactElement<ActionProps> | undefined {
  const left = headerOptions().headerLeft?.();
  const found: ReactElement<ActionProps>[] = [];
  const walk = (node: ReactNode) =>
    Children.forEach(node, (el) => {
      if (!isValidElement<ActionProps>(el)) return;
      if (el.props.accessibilityLabel === label) found.push(el);
      walk(el.props.children);
    });
  walk(left);
  return found[0];
}

/** The visible text inside a header action (its Text child's string). */
function actionText(el: ReactElement<ActionProps>): string {
  const texts: string[] = [];
  const walk = (node: ReactNode) =>
    Children.forEach(node, (child) => {
      if (typeof child === 'string') texts.push(child);
      else if (isValidElement<{ children?: ReactNode }>(child)) walk(child.props.children);
    });
  walk(el.props.children);
  return texts.join('');
}

function pressHeader(label: string) {
  const el = headerAction(label);
  if (!el) throw new Error(`no header action '${label}'`);
  act(() => el.props.onPress());
}

const row = (name: RegExp) => screen.getByLabelText(name);

beforeEach(() => {
  mockPush.mockClear();
  mockAddSpotsToList.mockClear();
  jest.mocked(useRouter).mockReturnValue({ push: mockPush, back: jest.fn(), replace: jest.fn() } as never);
  useSpotsStore.setState({
    spots: [a, b, c],
    filters: { ...DEFAULT_FILTERS },
    searchQuery: '',
    sortField: SortField.Name,
    sortDirection: SortDirection.Asc,
    sortChosen: true,
    viewMode: 'list',
  });
  useMediaStore.setState({ mediaBySpot: {} });
  useLocationStore.setState({ currentLocation: null });
  useHitListsStore.setState({ lists: [downtown], membershipBySpot: {}, activeListId: null });
});

describe('Spots tab multi-select', () => {
  it('starts outside select mode: plain rows, a Select action, no select bar', () => {
    render(<SpotsScreen />);

    expect(row(/Alley rail/).props.accessibilityRole).toBe('button');
    const select = headerAction('Select spots');
    expect(select && actionText(select)).toBe('Select');
    expect(headerAction('Cancel selection')).toBeUndefined();
    expect(headerOptions().headerTitle).toBeUndefined();
    expect(screen.queryByTestId('select-bar')).toBeNull();
    expect(screen.getByLabelText('Add new spot')).toBeTruthy();
  });

  it('a long press enters select mode with that row checked, Cancel in the header and "1 selected"', () => {
    render(<SpotsScreen />);

    fireEvent(row(/Bank to wall/), 'longPress');

    expect(row(/Bank to wall/).props.accessibilityState).toEqual({ checked: true });
    expect(row(/Alley rail/).props.accessibilityRole).toBe('checkbox');
    expect(row(/Alley rail/).props.accessibilityState).toEqual({ checked: false });
    expect(headerAction('Select spots')).toBeUndefined();
    const cancel = headerAction('Cancel selection');
    expect(cancel && actionText(cancel)).toBe('Cancel');
    expect(headerOptions().headerTitle).toBe('1 selected');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('the Select action enters select mode with nothing checked', () => {
    render(<SpotsScreen />);

    pressHeader('Select spots');

    expect(row(/Alley rail/).props.accessibilityState).toEqual({ checked: false });
    expect(headerOptions().headerTitle).toBe('0 selected');
    expect(screen.getByLabelText('Add to list (0)').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('a tap checks a second row, a tap on a checked row unchecks it, and no tap navigates', () => {
    render(<SpotsScreen />);
    fireEvent(row(/Alley rail/), 'longPress');

    fireEvent.press(row(/Church ledge/));
    expect(row(/Church ledge/).props.accessibilityState).toEqual({ checked: true });
    expect(headerOptions().headerTitle).toBe('2 selected');

    fireEvent.press(row(/Alley rail/));
    expect(row(/Alley rail/).props.accessibilityState).toEqual({ checked: false });
    expect(headerOptions().headerTitle).toBe('1 selected');

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('Cancel leaves select mode with nothing selected', () => {
    render(<SpotsScreen />);
    fireEvent(row(/Alley rail/), 'longPress');
    fireEvent.press(row(/Bank to wall/));

    pressHeader('Cancel selection');

    expect(row(/Alley rail/).props.accessibilityRole).toBe('button');
    expect(row(/Alley rail/).props.accessibilityState?.checked).toBeUndefined();
    expect(screen.queryByTestId('select-bar')).toBeNull();
    expect(headerOptions().headerTitle).toBeUndefined();
    expect(headerAction('Select spots')).toBeTruthy();

    // Entering again starts from the one long-pressed row, not the old selection.
    fireEvent(row(/Church ledge/), 'longPress');
    expect(headerOptions().headerTitle).toBe('1 selected');
    expect(row(/Alley rail/).props.accessibilityState).toEqual({ checked: false });
  });

  it('hides the FAB column while selecting and brings it back after', () => {
    render(<SpotsScreen />);
    fireEvent(row(/Alley rail/), 'longPress');

    expect(screen.queryByLabelText('Add new spot')).toBeNull();
    expect(screen.queryByLabelText('Import photos')).toBeNull();

    pressHeader('Cancel selection');
    expect(screen.getByLabelText('Add new spot')).toBeTruthy();
  });

  it("the select bar's 'Add to list (2)' opens the sheet with both ids, and closing it ends select mode", () => {
    render(<SpotsScreen />);
    fireEvent(row(/Alley rail/), 'longPress');
    fireEvent.press(row(/Church ledge/));

    const bar = screen.getByTestId('select-bar');
    expect(within(bar).getByText('Add to list (2)')).toBeTruthy();
    expect(screen.UNSAFE_getByType(AddToListSheet).props.visible).toBe(false);

    fireEvent.press(within(bar).getByLabelText('Add to list (2)'));

    const sheet = screen.UNSAFE_getByType(AddToListSheet);
    expect(sheet.props.visible).toBe(true);
    expect(sheet.props.spotIds).toEqual(['a', 'c']);
    fireEvent.press(screen.getByLabelText('Downtown'));
    expect(mockAddSpotsToList).toHaveBeenCalledWith(downtown.id, ['a', 'c']);

    fireEvent.press(screen.getByText('Done'));

    expect(screen.UNSAFE_getByType(AddToListSheet).props.visible).toBe(false);
    expect(screen.queryByTestId('select-bar')).toBeNull();
    expect(headerOptions().headerTitle).toBeUndefined();
    expect(row(/Alley rail/).props.accessibilityRole).toBe('button');
    expect(screen.getByLabelText('Add new spot')).toBeTruthy();
  });

  it('outside select mode a tap opens the spot (control for the no-navigation case)', () => {
    render(<SpotsScreen />);

    fireEvent.press(row(/Alley rail/));

    expect(mockPush).toHaveBeenCalledWith('/spot/a');
  });

  it('swiping the sheet down (onRequestClose) also ends select mode', () => {
    render(<SpotsScreen />);
    fireEvent(row(/Alley rail/), 'longPress');
    fireEvent.press(screen.getByLabelText('Add to list (1)'));

    act(() => screen.UNSAFE_getByType(Modal).props.onRequestClose());

    expect(screen.queryByTestId('select-bar')).toBeNull();
    expect(headerOptions().headerTitle).toBeUndefined();
  });

  it('a selected spot deleted elsewhere drops out of the count and the ids filed', () => {
    render(<SpotsScreen />);
    fireEvent(row(/Alley rail/), 'longPress');
    fireEvent.press(row(/Bank to wall/));

    act(() => useSpotsStore.setState({ spots: [b, c] }));

    expect(headerOptions().headerTitle).toBe('1 selected');
    fireEvent.press(screen.getByLabelText('Add to list (1)'));
    expect(screen.UNSAFE_getByType(AddToListSheet).props.spotIds).toEqual(['b']);
  });

  it('ends select mode when no spots are left', () => {
    render(<SpotsScreen />);
    fireEvent(row(/Alley rail/), 'longPress');

    act(() => useSpotsStore.setState({ spots: [] }));

    expect(screen.queryByTestId('select-bar')).toBeNull();
    expect(headerOptions().headerTitle).toBeUndefined();
    expect(screen.getByLabelText('Add new spot')).toBeTruthy();
  });

  it('has no Send action yet (S7 adds it)', () => {
    render(<SpotsScreen />);
    fireEvent(row(/Alley rail/), 'longPress');

    expect(screen.queryByText(/Send/)).toBeNull();
    expect(screen.queryByLabelText(/Send/)).toBeNull();
  });

  it('switching to Map ends select mode, and Select is offered in List view only', () => {
    render(<SpotsScreen />);
    fireEvent(row(/Alley rail/), 'longPress');

    fireEvent.press(screen.getByText('Map'));

    expect(screen.queryByTestId('select-bar')).toBeNull();
    expect(headerOptions().headerTitle).toBeUndefined();
    expect(headerAction('Select spots')).toBeUndefined();
    expect(headerAction('Cancel selection')).toBeUndefined();

    fireEvent.press(screen.getByText('List'));
    expect(row(/Alley rail/).props.accessibilityRole).toBe('button');
    expect(headerAction('Select spots')).toBeTruthy();
  });

  it('offers no Select with zero spots', () => {
    useSpotsStore.setState({ spots: [] });
    render(<SpotsScreen />);

    expect(headerAction('Select spots')).toBeUndefined();
  });

  it('switching the list picker keeps only the selected spots in that list', () => {
    useHitListsStore.setState({ membershipBySpot: { b: [downtown.id] } });
    render(<SpotsScreen />);
    fireEvent(row(/Alley rail/), 'longPress');
    fireEvent.press(row(/Bank to wall/));
    expect(headerOptions().headerTitle).toBe('2 selected');

    fireEvent.press(screen.getByRole('tab', { name: 'Downtown' }));

    expect(screen.queryByLabelText(/Alley rail/)).toBeNull();
    expect(row(/Bank to wall/).props.accessibilityState).toEqual({ checked: true });
    expect(headerOptions().headerTitle).toBe('1 selected');
    fireEvent.press(screen.getByLabelText('Add to list (1)'));
    expect(screen.UNSAFE_getByType(AddToListSheet).props).toMatchObject({ visible: true, spotIds: ['b'] });
  });

  it('a spot dropped by a picker switch stays unchecked after switching back', () => {
    useHitListsStore.setState({ membershipBySpot: { b: [downtown.id] } });
    render(<SpotsScreen />);
    fireEvent(row(/Alley rail/), 'longPress');
    fireEvent.press(row(/Bank to wall/));

    fireEvent.press(screen.getByRole('tab', { name: 'Downtown' }));
    fireEvent.press(screen.getByRole('tab', { name: 'My spots' }));

    expect(row(/Alley rail/).props.accessibilityState).toEqual({ checked: false });
    expect(row(/Bank to wall/).props.accessibilityState).toEqual({ checked: true });
    expect(headerOptions().headerTitle).toBe('1 selected');
  });

  it('switching to an empty list ends select mode', () => {
    const bridges = createTestHitList({ id: 'L-bridges', name: 'Bridges' });
    useHitListsStore.setState({ lists: [downtown, bridges] });
    render(<SpotsScreen />);
    fireEvent(row(/Alley rail/), 'longPress');

    fireEvent.press(screen.getByRole('tab', { name: 'Bridges' }));

    expect(screen.queryByTestId('select-bar')).toBeNull();
    expect(headerOptions().headerTitle).toBeUndefined();
    expect(screen.getByText('No spots in this list yet')).toBeTruthy();
  });
});
