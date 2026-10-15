import { render, screen, fireEvent } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native';
import { useMediaStore, useSpotsStore } from '@/src/stores';
import { DEFAULT_FILTERS, SpotStatus } from '@/src/types';
import { createTestSpot } from './factories';

import SpotsScreen from '@/app/(tabs)/index';

const spots = [
  createTestSpot({ name: 'Pier 57 rail', status: SpotStatus.Complete }),
  createTestSpot({ name: 'Library ledge', status: SpotStatus.Draft }),
];

describe('Spots tab Import photos action', () => {
  const push = jest.fn();

  beforeEach(() => {
    push.mockClear();
    jest.mocked(useRouter).mockReturnValue({ push, back: jest.fn(), replace: jest.fn() } as never);
    useSpotsStore.setState({ spots, filters: { ...DEFAULT_FILTERS }, viewMode: 'list' });
    useMediaStore.setState({ mediaBySpot: {} });
  });

  it('opens the batch import flow from list mode', () => {
    // D12: the import entry point lives on the Spots tab, reachable while browsing the list.
    // Screen readers need the button role, since the control is icon/label-only.
    render(<SpotsScreen />);

    const importAction = screen.getByLabelText('Import photos');
    expect(importAction.props.accessibilityRole).toBe('button');
    fireEvent.press(importAction);

    expect(push).toHaveBeenCalledWith('/import');
  });

  it('opens the batch import flow from map mode', () => {
    // The action must not disappear when the user switches to the map.
    useSpotsStore.setState({ viewMode: 'map' });

    render(<SpotsScreen />);
    fireEvent.press(screen.getByLabelText('Import photos'));

    expect(push).toHaveBeenCalledWith('/import');
  });

  it('is still shown in list mode with zero spots', () => {
    // A new user with no spots is the main import audience; the empty state must not hide it.
    useSpotsStore.setState({ spots: [] });

    render(<SpotsScreen />);

    expect(screen.getByLabelText('Import photos')).toBeTruthy();
  });

  it('keeps the existing Add new spot button pushing the camera route', () => {
    // Regression guard: adding the import action must not displace or rewire the "+" button.
    render(<SpotsScreen />);

    fireEvent.press(screen.getByLabelText('Add new spot'));

    expect(push).toHaveBeenCalledWith('/add/camera');
  });

  it('pads the list bottom so the last rows can scroll clear of the floating buttons', () => {
    // The two floating buttons stack ~148pt tall bottom-right; without paddingBottom the last rows stay hidden.
    render(<SpotsScreen />);

    const { contentContainerStyle } = screen.UNSAFE_getByType(FlashList).props as {
      contentContainerStyle?: StyleProp<ViewStyle>;
    };
    expect(StyleSheet.flatten(contentContainerStyle)?.paddingBottom ?? 0).toBeGreaterThanOrEqual(148);
  });
});
