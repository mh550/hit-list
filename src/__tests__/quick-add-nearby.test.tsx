import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMediaStore, useSettingsStore, useSpotsStore } from '@/src/stores';
import { SIGNED_OUT, useAuthStore } from '@/src/stores/auth-store';
import { NO_LOCATION } from '@/src/utils/geo';
import { UnitSystem, type GeoPoint, type Media, type Spot } from '@/src/types';
import type { NewPhoto } from '@/src/hooks/use-media-actions';
import { CITIES, createTestMedia, createTestSpot } from './factories';

/** One log for the hooks and the router, so the order of calls can be asserted. */
const calls: string[] = [];
const mockAddSpot = jest.fn(async (_spot: Spot) => {
  calls.push('addSpot');
});
const mockUpdateSpot = jest.fn(async (_id: string, _updates: object) => {
  calls.push('updateSpot');
});
const mockSavePhotos = jest.fn(async (photos: NewPhoto[]): Promise<Media[]> => {
  calls.push('savePhotos');
  return photos.map(({ sourceUri, ...fields }) => ({ ...fields, file_path: sourceUri }));
});
const mockDismissAll = jest.fn(() => calls.push('dismissAll'));
const mockPush = jest.fn((href: string) => calls.push(`push ${href}`));

jest.mock('@/src/hooks/use-spot-actions', () => ({
  useSpotActions: () => ({ addSpot: mockAddSpot, updateSpot: mockUpdateSpot }),
}));
jest.mock('@/src/hooks/use-media-actions', () => ({
  useMediaActions: () => ({ savePhotos: mockSavePhotos }),
}));

import QuickAddReview from '@/app/add/review';

const here = CITIES.seattle;
/** Metres per degree of latitude on the haversine sphere (R = 6371 km). */
const M_PER_DEG_LAT = (6371000 * Math.PI) / 180;
const north = (meters: number): GeoPoint => ({
  latitude: here.latitude + meters / M_PER_DEG_LAT,
  longitude: here.longitude,
});

const at5 = createTestSpot({ name: 'Five Rail', location: north(5), primary_photo_id: 'p5' });
const at20 = createTestSpot({ name: 'Twenty Ledge', location: north(20) }); // no photos
const at45 = createTestSpot({ name: 'Forty Five Bank', location: north(45) });
const at80 = createTestSpot({ name: 'Eighty Gap', location: north(80) });
const photo5 = createTestMedia({ id: 'p5', spot_id: at5.id, file_path: 'file:///photos/p5.jpg' });
const photo45 = createTestMedia({ spot_id: at45.id, file_path: 'file:///photos/p45.jpg' });

const URIS = ['file:///c/a.jpg', 'file:///c/b.jpg'];

function setParams(location: GeoPoint) {
  jest.mocked(useLocalSearchParams).mockReturnValue({
    photoUris: URIS.join(','),
    latitude: String(location.latitude),
    longitude: String(location.longitude),
  } as never);
}

const nearbyLines = () => screen.queryAllByText(/^Near /).map((t) => t.props.children as string);

describe("Quick Add review: nearby spots offer 'Add photos there' (M6-03, D25)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    calls.length = 0;
    useSpotsStore.setState({ spots: [at80, at45, at20, at5] }); // store order is not distance order
    useMediaStore.setState({ mediaBySpot: { [at5.id]: [photo5], [at45.id]: [photo45] } });
    useSettingsStore.setState({ units: UnitSystem.Imperial, batch_import_radius: 50 });
    setParams(here);
    jest.mocked(useRouter).mockReturnValue({ dismissAll: mockDismissAll, push: mockPush, back: jest.fn() } as never);
  });

  it('shows the spots within the radius, nearest first, with display name and imperial distance', () => {
    render(<QuickAddReview />);

    expect(nearbyLines()).toEqual(['Near Five Rail · 16 ft', 'Near Twenty Ledge · 66 ft', 'Near Forty Five Bank · 148 ft']);
    expect(screen.getAllByRole('button', { name: /^Add photos there, / })).toHaveLength(3);
    expect(screen.getAllByText('Add photos there')).toHaveLength(3);
    expect(screen.queryByText(/Eighty Gap/)).toBeNull();
  });

  it("never offers another rider's spot (S8, D47: photos can't be added to it)", () => {
    useAuthStore.setState({ status: 'signed_in', userId: 'u-me', username: 'me' });
    useSpotsStore.setState({ spots: [at80, at45, at20, { ...at5, owner_id: 'u-ana' }] });
    render(<QuickAddReview />);

    expect(nearbyLines()).toEqual(['Near Twenty Ledge · 66 ft', 'Near Forty Five Bank · 148 ft']);
    act(() => useAuthStore.setState(SIGNED_OUT));
  });

  it('uses metric distances when units are metric, and follows a units change', () => {
    useSettingsStore.setState({ units: UnitSystem.Metric });
    render(<QuickAddReview />);
    expect(nearbyLines()[0]).toBe('Near Five Rail · 5 m');

    act(() => useSettingsStore.setState({ units: UnitSystem.Imperial }));
    expect(nearbyLines()[0]).toBe('Near Five Rail · 16 ft');
  });

  it("shows the spot's primary thumbnail when it has one, a placeholder when not", () => {
    render(<QuickAddReview />);

    expect(screen.getByTestId(`nearby-thumb-${at5.id}`).props.source).toEqual({ uri: 'file:///photos/p5.jpg' });
    expect(screen.getByTestId(`nearby-thumb-${at45.id}`).props.source).toEqual({ uri: 'file:///photos/p45.jpg' });
    expect(screen.queryByTestId(`nearby-thumb-${at20.id}`)).toBeNull();
    expect(screen.getByTestId(`nearby-thumb-placeholder-${at20.id}`)).toBeTruthy();
  });

  it('shows no card when nothing is within the radius', () => {
    useSpotsStore.setState({ spots: [at80] });
    render(<QuickAddReview />);

    expect(nearbyLines()).toEqual([]);
    expect(screen.queryByText('Add photos there')).toBeNull();
  });

  it('shows no card when the review has no location', () => {
    setParams(NO_LOCATION);
    useSpotsStore.setState({ spots: [createTestSpot({ name: 'Null Island', location: north(0) }), at5] });
    render(<QuickAddReview />);

    expect(nearbyLines()).toEqual([]);
    expect(screen.queryByText('Add photos there')).toBeNull();
  });

  it("'Add photos there' saves every photo to that spot, creates nothing, then opens it", async () => {
    render(<QuickAddReview />);
    fireEvent.press(screen.getByRole('button', { name: 'Add photos there, Twenty Ledge' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalled());

    expect(mockAddSpot).not.toHaveBeenCalled();
    expect(mockSavePhotos).toHaveBeenCalledTimes(1);
    const photos = mockSavePhotos.mock.calls[0][0];
    expect(photos.map((p) => p.sourceUri)).toEqual(URIS);
    for (const p of photos) {
      expect(p).toMatchObject({ spot_id: at20.id, location: { latitude: here.latitude, longitude: here.longitude } });
      expect(new Date(p.created_at).getTime()).toBeGreaterThan(Date.now() - 60_000);
    }
    expect(new Set(photos.map((p) => p.id)).size).toBe(2);
    // The spot had no photos, so the first saved one becomes its primary.
    expect(mockUpdateSpot).toHaveBeenCalledWith(at20.id, { primary_photo_id: photos[0].id });
    expect(calls).toEqual(['savePhotos', 'updateSpot', 'dismissAll', `push /spot/${at20.id}`]);
  });

  it('leaves the primary photo alone on a spot that already has photos', async () => {
    render(<QuickAddReview />);
    fireEvent.press(screen.getByRole('button', { name: 'Add photos there, Forty Five Bank' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/spot/${at45.id}`));

    expect(mockUpdateSpot).not.toHaveBeenCalled();
    expect(calls).toEqual(['savePhotos', 'dismissAll', `push /spot/${at45.id}`]);
  });

  it('runs once under a double tap', async () => {
    render(<QuickAddReview />);
    const button = screen.getByRole('button', { name: 'Add photos there, Five Rail' });
    fireEvent.press(button);
    fireEvent.press(button);
    fireEvent.press(screen.getByRole('button', { name: 'Save spot' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalled());

    expect(mockSavePhotos).toHaveBeenCalledTimes(1);
    expect(mockAddSpot).not.toHaveBeenCalled();
  });

  it('Save still creates a new spot when cards are shown', async () => {
    render(<QuickAddReview />);
    expect(nearbyLines()).toHaveLength(3);
    fireEvent.press(screen.getByRole('button', { name: 'Save spot' }));
    await waitFor(() => expect(mockDismissAll).toHaveBeenCalled());

    expect(mockAddSpot).toHaveBeenCalledTimes(1);
    const spot = mockAddSpot.mock.calls[0][0];
    expect([at5.id, at20.id, at45.id]).not.toContain(spot.id);
    expect(mockSavePhotos.mock.calls[0][0].every((p) => p.spot_id === spot.id)).toBe(true);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("a photo 'Add photos there' couldn't save stays on screen with an Alert, and a retry saves only it there", async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    // savePhotos logs a failed row and resolves with the rest (it never rejects): the second photo is dropped.
    mockSavePhotos.mockImplementationOnce(async (photos) => [
      { ...photos[0], file_path: photos[0].sourceUri },
    ]);
    render(<QuickAddReview />);
    fireEvent.press(screen.getByRole('button', { name: 'Add photos there, Twenty Ledge' }));
    await waitFor(() => expect(alert).toHaveBeenCalledWith("Some photos weren't saved", expect.any(String)));

    expect(mockDismissAll).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Add photos there, Twenty Ledge' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/spot/${at20.id}`));
    expect(mockSavePhotos.mock.calls[1][0].map((p) => [p.sourceUri, p.spot_id])).toEqual([[URIS[1], at20.id]]);
    alert.mockRestore();
  });

  it('a Save whose photos were not saved stays on screen, and a retry adds them to the same new spot', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockSavePhotos.mockImplementationOnce(async () => []); // every row failed (logged by the hook)
    render(<QuickAddReview />);
    fireEvent.press(screen.getByRole('button', { name: 'Save spot' }));
    await waitFor(() => expect(alert).toHaveBeenCalledWith("Some photos weren't saved", expect.any(String)));
    expect(mockDismissAll).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Save spot' }));
    await waitFor(() => expect(mockDismissAll).toHaveBeenCalled());
    const spot = mockAddSpot.mock.calls[0][0];
    expect(mockAddSpot).toHaveBeenCalledTimes(1);
    expect(mockSavePhotos.mock.calls[1][0].map((p) => [p.sourceUri, p.spot_id])).toEqual(
      URIS.map((uri) => [uri, spot.id]),
    );
    expect(mockPush).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it("a Save whose spot wasn't written alerts, saves no photo, and a retry creates the spot", async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockAddSpot.mockRejectedValueOnce(new Error('DB write failed'));
    render(<QuickAddReview />);
    fireEvent.press(screen.getByRole('button', { name: 'Save spot' }));
    await waitFor(() => expect(alert).toHaveBeenCalledWith("Couldn't save the spot", expect.any(String)));
    expect(mockSavePhotos).not.toHaveBeenCalled();
    expect(mockDismissAll).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Save spot' }));
    await waitFor(() => expect(mockDismissAll).toHaveBeenCalled());
    expect(mockAddSpot).toHaveBeenCalledTimes(2);
    expect(mockSavePhotos).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it('runs once when two presses land before a re-render', async () => {
    render(<QuickAddReview />);
    const addThere = screen.getByRole('button', { name: 'Add photos there, Five Rail' });
    const save = screen.getByRole('button', { name: 'Save spot' });
    act(() => {
      fireEvent.press(addThere);
      fireEvent.press(addThere);
      fireEvent.press(save);
    });
    await waitFor(() => expect(mockPush).toHaveBeenCalled());

    expect(mockSavePhotos).toHaveBeenCalledTimes(1);
    expect(mockAddSpot).not.toHaveBeenCalled();
  });

  it('offers no spot when there are no photos to add', () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({
      photoUris: '',
      latitude: String(here.latitude),
      longitude: String(here.longitude),
    } as never);
    render(<QuickAddReview />);
    expect(screen.getByText('No photos captured')).toBeTruthy();
    expect(nearbyLines()).toEqual([]);
  });
});
