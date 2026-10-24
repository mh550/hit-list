import type { ReactElement } from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { FlashList } from '@shopify/flash-list';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text } from 'react-native';
import { useMediaStore, useSpotsStore } from '@/src/stores';
import { useLocationStore } from '@/src/stores/location-store';
import { DEFAULT_FILTERS, SortDirection, SortField } from '@/src/types';
import { CITIES, createTestSpot } from './factories';

import { SpotsBrowser } from '@/src/components';
import { SpotMap } from '@/src/components/SpotMap';

const pier = createTestSpot({ name: 'Pier 57 rail', location: CITIES.seattle });
const library = createTestSpot({ name: 'Library ledge', stopped: true, location: CITIES.portland });

const EMPTY = { emptyTitle: 'Nothing here', emptyMessage: 'Add a spot to see it' };

beforeEach(() => {
  // SpotsBrowser browses its `spots` prop; the store's own spots must not leak in.
  useSpotsStore.setState({
    spots: [],
    filters: { ...DEFAULT_FILTERS },
    searchQuery: '',
    sortField: SortField.DateAdded,
    sortDirection: SortDirection.Desc,
    sortChosen: false,
    viewMode: 'list',
  });
  useMediaStore.setState({ mediaBySpot: {} });
  useLocationStore.setState({ currentLocation: null });
});

describe('SpotsBrowser', () => {
  it('shows one row per spot it is given', () => {
    render(<SpotsBrowser spots={[pier, library]} {...EMPTY} />);

    expect(screen.getByText('Pier 57 rail')).toBeTruthy();
    expect(screen.getByText('Library ledge')).toBeTruthy();
    expect(screen.queryByText('Nothing here')).toBeNull();
  });

  it('shows the empty title, message and action when given no spots', () => {
    const onEmptyAction = jest.fn();
    render(
      <SpotsBrowser spots={[]} {...EMPTY} emptyActionLabel="Do it" onEmptyAction={onEmptyAction} />,
    );

    expect(screen.getByText('Nothing here')).toBeTruthy();
    expect(screen.getByText('Add a spot to see it')).toBeTruthy();
    fireEvent.press(screen.getByText('Do it'));
    expect(onEmptyAction).toHaveBeenCalledTimes(1);
  });

  it('filters by the store searchQuery, then offers Clear search when nothing matches', () => {
    useSpotsStore.setState({ searchQuery: 'library' });
    render(<SpotsBrowser spots={[pier, library]} {...EMPTY} />);

    expect(screen.getByText('Library ledge')).toBeTruthy();
    expect(screen.queryByText('Pier 57 rail')).toBeNull();

    act(() => useSpotsStore.getState().setSearchQuery('no such spot'));

    expect(screen.getByText('No matching spots')).toBeTruthy();
    expect(screen.queryByText('Nothing here')).toBeNull();
    fireEvent.press(screen.getByText('Clear search'));
    expect(useSpotsStore.getState().searchQuery).toBe('');
    expect(screen.getByText('Pier 57 rail')).toBeTruthy();
  });

  it('switches to Map and hands SpotMap the filtered spots', () => {
    useSpotsStore.setState({ filters: { ...DEFAULT_FILTERS, stopped: true } });
    render(<SpotsBrowser spots={[pier, library]} {...EMPTY} />);

    fireEvent.press(screen.getByText('Map'));

    expect(useSpotsStore.getState().viewMode).toBe('map');
    expect(screen.UNSAFE_getByType(SpotMap).props.spots).toEqual([library]);
    expect(screen.getAllByTestId(/^spot-marker-/)).toHaveLength(1);
  });

  it('pads the list bottom by contentBottomInset', () => {
    render(<SpotsBrowser spots={[pier]} {...EMPTY} contentBottomInset={200} />);

    const { contentContainerStyle } = screen.UNSAFE_getByType(FlashList).props as {
      contentContainerStyle?: StyleProp<ViewStyle>;
    };
    expect(StyleSheet.flatten(contentContainerStyle)?.paddingBottom).toBe(200);
  });

  it('renders aboveList', () => {
    render(<SpotsBrowser spots={[pier]} {...EMPTY} aboveList={<Text>Picker row</Text>} />);

    expect(screen.getByText('Picker row')).toBeTruthy();
  });

  it('renders headerActions in the header before Filter', () => {
    render(<SpotsBrowser spots={[pier]} {...EMPTY} headerActions={<Text>Rename</Text>} />);

    const { options } = screen.UNSAFE_getByType('Stack.Screen' as never).props as {
      options: { headerRight: () => ReactElement };
    };
    const header = render(options.headerRight());
    const texts = header.UNSAFE_getAllByType(Text).map((t) => t.props.children);
    expect(texts[0]).toBe('Rename');
    expect(header.getByLabelText('Filter spots')).toBeTruthy();
    header.unmount();
  });

  it('calls onSpotLongPress with the row id', () => {
    const onSpotLongPress = jest.fn();
    render(<SpotsBrowser spots={[pier, library]} {...EMPTY} onSpotLongPress={onSpotLongPress} />);

    fireEvent(screen.getByRole('button', { name: /^Library ledge/ }), 'longPress');

    expect(onSpotLongPress).toHaveBeenCalledWith(library.id);
  });
});
