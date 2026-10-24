import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMediaStore, useSettingsStore, useSpotsStore } from '@/src/stores';
import { SIGNED_OUT, useAuthStore } from '@/src/stores/auth-store';
import { UnitSystem, type GeoPoint, type Media, type Spot } from '@/src/types';
import type { NewPhoto } from '@/src/hooks/use-media-actions';
import type { ImportPhoto } from '@/src/utils/import-clustering';
import { getSpotDisplayName } from '@/src/utils/spot-name';
import { CITIES, createTestMedia, createTestSpot } from './factories';

const mockAddSpot = jest.fn(async (_spot: Spot) => {});
const mockUpdateSpot = jest.fn(async (_id: string, _updates: object) => {});
const mockSavePhotos = jest.fn(async (photos: NewPhoto[]): Promise<Media[]> =>
  photos.map(({ sourceUri, ...fields }) => ({ ...fields, file_path: sourceUri })),
);
const mockDismissAll = jest.fn();

jest.mock('@/src/hooks/use-spot-actions', () => ({
  useSpotActions: () => ({ addSpot: mockAddSpot, updateSpot: mockUpdateSpot }),
}));
jest.mock('@/src/hooks/use-media-actions', () => ({
  useMediaActions: () => ({ savePhotos: mockSavePhotos }),
}));

import ImportReview from '@/app/import/review';

const here = CITIES.seattle;
/** Metres per degree of latitude on the haversine sphere (R = 6371 km). */
const M_PER_DEG_LAT = (6371000 * Math.PI) / 180;
const north = (meters: number): GeoPoint => ({
  latitude: here.latitude + meters / M_PER_DEG_LAT,
  longitude: here.longitude,
});

const photo = (name: string, location: GeoPoint | null, capturedAt: string): ImportPhoto => ({
  uri: `file:///c/${name}.jpg`,
  location,
  capturedAt,
});

// Group A starts at `here`; the existing spot is 15 m north of it. Group B is 5 km away.
const groupA = [photo('a1', here, '2026-10-01T10:00:00'), photo('a2', north(3), '2026-10-01T10:01:00')];
const groupB = [photo('b1', north(5000), '2026-10-02T11:00:00')];
const existing = createTestSpot({ name: 'Library Rail', location: north(15) }); // no photos yet

function setGroups(groups: ImportPhoto[][]) {
  jest.mocked(useLocalSearchParams).mockReturnValue({ groupsJson: JSON.stringify(groups) } as never);
}

const choice = (name: string) => screen.getByRole('button', { name });
const isSelected = (name: string) => choice(name).props.accessibilityState?.selected === true;

describe("Import review: a group near an existing spot offers 'Add photos to <name>' (M6-04, D25)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddSpot.mockImplementation(async () => {});
    useSpotsStore.setState({ spots: [existing] });
    useMediaStore.setState({ mediaBySpot: {} });
    useSettingsStore.setState({ units: UnitSystem.Imperial, batch_import_radius: 50 });
    setGroups([groupA, groupB]);
    jest.mocked(useRouter).mockReturnValue({ dismissAll: mockDismissAll, push: jest.fn(), back: jest.fn() } as never);
  });

  it("offers the nearby spot on group A only, with 'New spot' selected by default", () => {
    render(<ImportReview />);

    expect(screen.getAllByText(/^Near /).map((t) => t.props.children)).toEqual(['Near Library Rail · 49 ft']);
    expect(isSelected('New spot')).toBe(true);
    expect(isSelected('Add photos to Library Rail')).toBe(false);
    expect(screen.getAllByRole('button', { name: 'New spot' })).toHaveLength(1); // B has no choice row
    expect(screen.getAllByPlaceholderText('Spot name (optional)')).toHaveLength(2);
    expect(screen.getByText(/^2 spots from your photos/)).toBeTruthy();
    expect(screen.getByText('Import 2 Spots')).toBeTruthy();
  });

  it("never offers another rider's spot (S8, D47)", () => {
    useAuthStore.setState({ status: 'signed_in', userId: 'u-me', username: 'me' });
    useSpotsStore.setState({ spots: [{ ...existing, owner_id: 'u-ana' }] });
    render(<ImportReview />);

    expect(screen.queryAllByText(/^Near /)).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Add photos to Library Rail' })).toBeNull();
    act(() => useAuthStore.setState(SIGNED_OUT));
  });

  it('uses metric distances when units are metric, and follows a units change', () => {
    useSettingsStore.setState({ units: UnitSystem.Metric });
    render(<ImportReview />);
    expect(screen.getByText('Near Library Rail · 15 m')).toBeTruthy();

    act(() => useSettingsStore.setState({ units: UnitSystem.Imperial }));
    expect(screen.getByText('Near Library Rail · 49 ft')).toBeTruthy();
  });

  it('never counts another group of the same import as nearby', () => {
    useSpotsStore.setState({ spots: [] });
    setGroups([[photo('x', here, '2026-10-01T10:00:00')], [photo('y', north(5), '2026-10-01T10:05:00')]]);
    render(<ImportReview />);

    expect(screen.queryByText(/^Near /)).toBeNull();
    expect(screen.queryByRole('button', { name: 'New spot' })).toBeNull();
  });

  it('ignores a group without a location and deleted spots', () => {
    useSpotsStore.setState({
      spots: [existing, createTestSpot({ name: 'Gone', location: north(5000), deleted_at: '2026-10-03T00:00:00Z' })],
    });
    setGroups([[photo('n', null, '2026-10-01T10:00:00')], groupB]);
    render(<ImportReview />);

    expect(screen.queryByText(/^Near /)).toBeNull();
  });

  it('choosing the existing spot hides the name field and counts only new spots', () => {
    render(<ImportReview />);
    fireEvent.press(choice('Add photos to Library Rail'));

    expect(isSelected('Add photos to Library Rail')).toBe(true);
    expect(isSelected('New spot')).toBe(false);
    expect(screen.getAllByPlaceholderText('Spot name (optional)')).toHaveLength(1);
    expect(screen.getByText(/^1 spot from your photos/)).toBeTruthy();
    expect(screen.getByText('Import 1 Spot')).toBeTruthy();

    fireEvent.press(choice('New spot'));
    expect(screen.getAllByPlaceholderText('Spot name (optional)')).toHaveLength(2);
    expect(screen.getByText('Import 2 Spots')).toBeTruthy();
  });

  it("says 'Add photos' when every group goes to a spot you already have", () => {
    setGroups([groupA]);
    render(<ImportReview />);
    fireEvent.press(choice('Add photos to Library Rail'));

    expect(screen.getByText('Photos go to spots you already have.')).toBeTruthy();
    expect(screen.getByText('Add photos')).toBeTruthy();
  });

  it("keeps 'Import 0 Spots' (not 'Add photos') once every group is removed", () => {
    render(<ImportReview />);
    for (const remove of screen.getAllByText('Remove')) fireEvent.press(remove);

    expect(screen.getByText('Import 0 Spots')).toBeTruthy();
    expect(screen.queryByText('Photos go to spots you already have.')).toBeNull();
  });

  it("Import sends group A's photos to the existing spot and creates only group B", async () => {
    render(<ImportReview />);
    fireEvent.press(choice('Add photos to Library Rail'));
    fireEvent.press(screen.getByText('Import 1 Spot'));
    await waitFor(() => expect(mockDismissAll).toHaveBeenCalled());

    expect(mockAddSpot).toHaveBeenCalledTimes(1);
    const newSpot = mockAddSpot.mock.calls[0][0];
    expect(newSpot.location).toEqual(groupB[0].location);

    expect(mockSavePhotos).toHaveBeenCalledTimes(2);
    const batches = mockSavePhotos.mock.calls.map(([photos]) => photos);
    const toExisting = batches.find((b) => b[0].spot_id === existing.id)!;
    const toNew = batches.find((b) => b[0].spot_id === newSpot.id)!;
    expect(toExisting.map((p) => [p.sourceUri, p.spot_id, p.captured_at, p.location])).toEqual([
      [groupA[0].uri, existing.id, groupA[0].capturedAt, groupA[0].location],
      [groupA[1].uri, existing.id, groupA[1].capturedAt, groupA[1].location],
    ]);
    expect(toNew.map((p) => p.sourceUri)).toEqual([groupB[0].uri]);

    // The existing spot had no photos, so group A's first saved photo becomes its primary.
    expect(mockUpdateSpot).toHaveBeenCalledTimes(1);
    expect(mockUpdateSpot).toHaveBeenCalledWith(existing.id, { primary_photo_id: toExisting[0].id });
  });

  it('leaves the primary alone on an existing spot that already has photos', async () => {
    useMediaStore.setState({ mediaBySpot: { [existing.id]: [createTestMedia({ spot_id: existing.id })] } });
    setGroups([groupA]);
    render(<ImportReview />);
    fireEvent.press(choice('Add photos to Library Rail'));
    fireEvent.press(screen.getByText('Add photos'));
    await waitFor(() => expect(mockDismissAll).toHaveBeenCalled());

    expect(mockAddSpot).not.toHaveBeenCalled();
    expect(mockSavePhotos).toHaveBeenCalledTimes(1);
    expect(mockUpdateSpot).not.toHaveBeenCalled();
  });

  it('sets the primary once when two groups go to the same photo-less spot', async () => {
    const groupA2 = [photo('a3', north(25), '2026-10-01T12:00:00')];
    setGroups([groupA, groupA2]);
    render(<ImportReview />);
    for (const button of screen.getAllByRole('button', { name: 'Add photos to Library Rail' })) {
      fireEvent.press(button);
    }
    fireEvent.press(screen.getByText('Add photos'));
    await waitFor(() => expect(mockDismissAll).toHaveBeenCalled());

    expect(mockSavePhotos).toHaveBeenCalledTimes(2);
    expect(mockUpdateSpot).toHaveBeenCalledTimes(1);
    const firstBatch = mockSavePhotos.mock.calls.map(([p]) => p).find((b) => b[0].sourceUri === groupA[0].uri)!;
    expect(mockUpdateSpot).toHaveBeenCalledWith(existing.id, { primary_photo_id: firstBatch[0].id });
  });

  it('a failed group alerts, keeps only the failed groups on screen, and a retry imports just those', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockSavePhotos.mockImplementationOnce(async (photos) => {
      if (photos[0].spot_id === existing.id) throw new Error('disk full');
      return photos.map(({ sourceUri, ...fields }) => ({ ...fields, file_path: sourceUri }));
    });
    render(<ImportReview />);
    fireEvent.press(choice('Add photos to Library Rail'));
    fireEvent.press(screen.getByText('Import 1 Spot'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith("Some photos weren't imported", expect.any(String)));

    // Group B was still saved; group A stays, still pointed at the existing spot, so a retry does not repeat B.
    expect(mockAddSpot).toHaveBeenCalledTimes(1);
    expect(mockDismissAll).not.toHaveBeenCalled();
    expect(screen.getByText('Photos go to spots you already have.')).toBeTruthy();

    fireEvent.press(screen.getByText('Add photos'));
    await waitFor(() => expect(mockDismissAll).toHaveBeenCalled());
    expect(mockAddSpot).toHaveBeenCalledTimes(1);
    expect(mockSavePhotos).toHaveBeenCalledTimes(3);
    expect(mockSavePhotos.mock.calls[2][0][0].spot_id).toBe(existing.id);
    alert.mockRestore();
  });

  it("a photo the existing spot didn't get stays on screen, still aimed there, and a retry saves only it", async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    // savePhotos logs a failed row and resolves with the rest: here group A's second photo is dropped.
    mockSavePhotos.mockImplementationOnce(async (photos) =>
      photos
        .filter((p) => p.sourceUri !== groupA[1].uri)
        .map(({ sourceUri, ...fields }) => ({ ...fields, file_path: sourceUri })),
    );
    setGroups([groupA]);
    render(<ImportReview />);
    fireEvent.press(choice('Add photos to Library Rail'));
    fireEvent.press(screen.getByText('Add photos'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith("Some photos weren't imported", expect.any(String)));

    expect(mockDismissAll).not.toHaveBeenCalled();
    expect(screen.getByText(/^1 photo ·/)).toBeTruthy();
    expect(isSelected('Add photos to Library Rail')).toBe(true);

    fireEvent.press(screen.getByText('Add photos'));
    await waitFor(() => expect(mockDismissAll).toHaveBeenCalled());
    expect(mockSavePhotos.mock.calls[1][0].map((p) => [p.sourceUri, p.spot_id])).toEqual([[groupA[1].uri, existing.id]]);
    expect(mockAddSpot).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it("a new spot's unsaved photos stay aimed at that spot, so a retry does not create a second one", async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockAddSpot.mockImplementation(async (spot) => useSpotsStore.getState().addSpot(spot)); // as the real hook does
    mockSavePhotos.mockImplementationOnce(async () => []); // every row failed (logged by the hook)
    const noLocation = [photo('n', null, '2026-10-02T11:00:00')]; // its new spot is never 'nearby' itself
    setGroups([noLocation]);
    render(<ImportReview />);
    fireEvent.press(screen.getByText('Import 1 Spot'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith("Some photos weren't imported", expect.any(String)));

    const newSpot = mockAddSpot.mock.calls[0][0];
    expect(screen.getByText('Add photos')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Spot name (optional)')).toBeNull();
    // The chip row still shows the chosen spot, and 'New spot' stays reachable.
    expect(isSelected(`Add photos to ${getSpotDisplayName(newSpot)}`)).toBe(true);
    expect(isSelected('New spot')).toBe(false);
    expect(screen.queryByText(/^Near /)).toBeNull(); // no distance from an unknown location

    fireEvent.press(screen.getByText('Add photos'));
    await waitFor(() => expect(mockDismissAll).toHaveBeenCalled());
    expect(mockAddSpot).toHaveBeenCalledTimes(1);
    expect(mockSavePhotos.mock.calls[1][0].map((p) => [p.sourceUri, p.spot_id])).toEqual([[noLocation[0].uri, newSpot.id]]);
    // The spot was created with a primary that never got a row, so the retry's photo becomes its primary.
    expect(mockUpdateSpot).toHaveBeenCalledWith(newSpot.id, { primary_photo_id: mockSavePhotos.mock.calls[1][0][0].id });
    alert.mockRestore();
  });

  it("a group whose new spot wasn't written stays on screen as a new spot, and a retry creates it", async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockAddSpot.mockRejectedValueOnce(new Error('DB write failed')); // useSpotActions takes it out of the store and rejects
    render(<ImportReview />);
    fireEvent.press(choice('Add photos to Library Rail'));
    fireEvent.press(screen.getByText('Import 1 Spot'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith("Some photos weren't imported", expect.any(String)));

    // Group A went to the existing spot; group B is back as a new spot, its photos never aimed at the missing one.
    expect(mockSavePhotos).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Import 1 Spot')).toBeTruthy();
    expect(screen.getByPlaceholderText('Spot name (optional)')).toBeTruthy();

    fireEvent.press(screen.getByText('Import 1 Spot'));
    await waitFor(() => expect(mockDismissAll).toHaveBeenCalled());
    expect(mockAddSpot).toHaveBeenCalledTimes(2);
    expect(mockSavePhotos.mock.calls[1][0].map((p) => p.sourceUri)).toEqual([groupB[0].uri]);
    alert.mockRestore();
  });

  it('imports once when two presses land before a re-render', async () => {
    render(<ImportReview />);
    const button = screen.getByRole('button', { name: 'Import 2 Spots' });
    act(() => {
      fireEvent.press(button);
      fireEvent.press(button);
    });
    await waitFor(() => expect(mockDismissAll).toHaveBeenCalled());
    expect(mockAddSpot).toHaveBeenCalledTimes(2);
    expect(mockSavePhotos).toHaveBeenCalledTimes(2);
  });

  it('locks the choices, names and Remove while importing', async () => {
    let finish: () => void = () => {};
    mockSavePhotos.mockImplementationOnce(
      (photos) =>
        new Promise((resolve) => {
          finish = () => resolve(photos.map(({ sourceUri, ...fields }) => ({ ...fields, file_path: sourceUri })));
        }),
    );
    setGroups([groupA]);
    render(<ImportReview />);
    fireEvent.press(screen.getByText('Import 1 Spot'));
    await waitFor(() => expect(mockSavePhotos).toHaveBeenCalled());

    expect(choice('New spot')).toBeDisabled();
    expect(choice('Add photos to Library Rail')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
    expect(screen.getByPlaceholderText('Spot name (optional)').props.editable).toBe(false);
    expect(screen.getByLabelText('Importing')).toBeTruthy();

    await act(async () => finish());
    await waitFor(() => expect(mockDismissAll).toHaveBeenCalled());
  });

  it('names the chosen spot and its distance in the line above the choice', () => {
    const bench = createTestSpot({ name: 'Bench Ledge', location: north(30) });
    useSpotsStore.setState({ spots: [existing, bench] });
    setGroups([groupA]);
    render(<ImportReview />);
    expect(screen.getByText(/^Near /).props.children).toBe('Near Library Rail · 49 ft');

    fireEvent.press(choice('Add photos to Bench Ledge'));
    expect(screen.getByText(/^Near /).props.children).toBe('Near Bench Ledge · 98 ft');
  });
});
