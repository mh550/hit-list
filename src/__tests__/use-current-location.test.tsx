import { renderHook, render, screen, waitFor } from '@testing-library/react-native';
import {
  getCurrentPositionAsync,
  getLastKnownPositionAsync,
  requestForegroundPermissionsAsync,
} from 'expo-location';
import { useCurrentLocation } from '@/src/hooks/use-current-location';
import { useLocationStore } from '@/src/stores/location-store';
import { useMediaStore, useSpotsStore } from '@/src/stores';
import { DEFAULT_FILTERS } from '@/src/types';
import { createTestSpot } from './factories';

import SpotsScreen from '@/app/(tabs)/index';

const granted = { status: 'granted', granted: true, canAskAgain: true, expires: 'never' } as never;
const at = (latitude: number, longitude: number) => ({ coords: { latitude, longitude }, timestamp: 0 }) as never;

describe('useCurrentLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useLocationStore.setState({ currentLocation: null, permissionStatus: 'undetermined' });
  });

  it('fills the location store when permission is granted', async () => {
    jest.mocked(requestForegroundPermissionsAsync).mockResolvedValueOnce(granted);
    jest.mocked(getCurrentPositionAsync).mockResolvedValueOnce(at(47.61, -122.33));

    renderHook(() => useCurrentLocation());

    await waitFor(() =>
      expect(useLocationStore.getState().currentLocation).toEqual({ latitude: 47.61, longitude: -122.33 }),
    );
    expect(useLocationStore.getState().permissionStatus).toBe('granted');
  });

  it('shows the last known position first, then the fresh one', async () => {
    jest.mocked(requestForegroundPermissionsAsync).mockResolvedValueOnce(granted);
    jest.mocked(getLastKnownPositionAsync).mockResolvedValueOnce(at(47.0, -122.0));
    let resolveFresh!: (v: never) => void;
    jest.mocked(getCurrentPositionAsync).mockReturnValueOnce(new Promise((r) => (resolveFresh = r)));

    renderHook(() => useCurrentLocation());

    await waitFor(() => expect(useLocationStore.getState().currentLocation).toEqual({ latitude: 47, longitude: -122 }));
    resolveFresh(at(47.61, -122.33));
    await waitFor(() =>
      expect(useLocationStore.getState().currentLocation).toEqual({ latitude: 47.61, longitude: -122.33 }),
    );
  });

  it('records a denial and never asks for a position', async () => {
    renderHook(() => useCurrentLocation());

    await waitFor(() => expect(useLocationStore.getState().permissionStatus).toBe('denied'));
    expect(getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(useLocationStore.getState().currentLocation).toBeNull();
  });

  it('survives a failing position request', async () => {
    jest.mocked(requestForegroundPermissionsAsync).mockResolvedValueOnce(granted);
    jest.mocked(getCurrentPositionAsync).mockRejectedValueOnce(new Error('kCLErrorLocationUnknown'));

    renderHook(() => useCurrentLocation());

    await waitFor(() => expect(useLocationStore.getState().permissionStatus).toBe('granted'));
    expect(useLocationStore.getState().currentLocation).toBeNull();
  });
});

describe('Spots tab distance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useLocationStore.setState({ currentLocation: null, permissionStatus: 'undetermined' });
    useMediaStore.setState({ mediaBySpot: {} });
  });

  it('shows a distance once the phone knows where it is', async () => {
    jest.mocked(requestForegroundPermissionsAsync).mockResolvedValueOnce(granted);
    jest.mocked(getCurrentPositionAsync).mockResolvedValueOnce(at(47.6062, -122.3321));
    useSpotsStore.setState({
      spots: [createTestSpot({ name: 'Near', location: { latitude: 47.6072, longitude: -122.3321 } })],
      filters: { ...DEFAULT_FILTERS },
      viewMode: 'list',
    });

    render(<SpotsScreen />);

    expect(await screen.findByText(/^\d+ ft$/)).toBeTruthy();
  });

  it('shows no distance for a spot saved without a location', async () => {
    jest.mocked(requestForegroundPermissionsAsync).mockResolvedValueOnce(granted);
    jest.mocked(getCurrentPositionAsync).mockResolvedValueOnce(at(47.6062, -122.3321));
    useSpotsStore.setState({
      spots: [
        createTestSpot({ name: 'Near', location: { latitude: 47.6072, longitude: -122.3321 } }),
        createTestSpot({ name: 'No fix', location: { latitude: 0, longitude: 0 } }),
      ],
      filters: { ...DEFAULT_FILTERS },
      viewMode: 'list',
    });

    render(<SpotsScreen />);

    expect(await screen.findByText(/^\d+ ft$/)).toBeTruthy();
    expect(screen.queryAllByText(/ (ft|mi)$/)).toHaveLength(1);
  });
});
