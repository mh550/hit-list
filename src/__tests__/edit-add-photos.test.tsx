import { Alert } from 'react-native';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerAsset, ImagePickerResult, MediaLibraryPermissionResponse, PermissionStatus } from 'expo-image-picker';
import { useMediaStore, useSpotsStore } from '@/src/stores';
import type { NewPhoto } from '@/src/hooks/use-media-actions';
import type { Media, Spot, SpotUpdate } from '@/src/types';
import { createTestMedia, createTestSpot } from './factories';

// Member names from node_modules/expo-image-picker/build/ImagePicker.d.ts (lines 25, 96).
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
}));

const mockUpdateSpot = jest.fn(async () => {});
jest.mock('@/src/hooks/use-spot-actions', () => ({
  useSpotActions: () => ({ updateSpot: mockUpdateSpot, addSpot: jest.fn(), removeSpot: jest.fn() }),
}));

// By default every photo is saved, as a fully successful savePhotos would resolve.
const toMedia = ({ sourceUri, ...fields }: NewPhoto): Media => ({ ...fields, file_path: sourceUri });
const mockSavePhotos = jest.fn(async (photos: NewPhoto[]) => photos.map(toMedia));
const mockRemovePhotos = jest.fn(async (ids: string[]) => ids);
jest.mock('@/src/hooks/use-media-actions', () => ({
  useMediaActions: () => ({ removePhotos: mockRemovePhotos, savePhotos: mockSavePhotos }),
}));

import EditSpotScreen from '@/app/spot/[id]/edit';

const launch = jest.mocked(ImagePicker.launchImageLibraryAsync);
const requestPermission = jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync);
// The module is mocked, so its PermissionStatus enum isn't there at runtime; its string values stand in.
const GRANTED: MediaLibraryPermissionResponse = {
  granted: true,
  status: 'granted' as PermissionStatus,
  canAskAgain: true,
  expires: 'never',
};
const DENIED: MediaLibraryPermissionResponse = {
  granted: false,
  status: 'denied' as PermissionStatus,
  canAskAgain: false,
  expires: 'never',
};

// Fixture EXIF: iOS reports unsigned GPS plus a ref, which importPhotoFromAsset signs.
const A1: ImagePickerAsset = {
  assetId: 'a1',
  uri: 'file:///picked/a1.jpg',
  width: 4032,
  height: 3024,
  exif: {
    DateTimeOriginal: '2026:10:12 14:22:05',
    GPSLatitude: 40.7,
    GPSLatitudeRef: 'N',
    GPSLongitude: 74.0,
    GPSLongitudeRef: 'W',
  },
};
const A2: ImagePickerAsset = {
  assetId: 'a2',
  uri: 'file:///picked/a2.jpg',
  width: 3024,
  height: 4032,
  exif: {
    DateTimeOriginal: '2026:10:13 09:05:00',
    GPSLatitude: 33.9,
    GPSLatitudeRef: 'S',
    GPSLongitude: 151.2,
    GPSLongitudeRef: 'E',
  },
};
const picked = (...assets: ImagePickerAsset[]): ImagePickerResult => ({ canceled: false, assets });

const mockBack = jest.fn();
const at = (min: number) => `2026-10-15T09:${String(min).padStart(2, '0')}:00.000Z`;
const makeMedia = (spotId: string, count: number): Media[] =>
  Array.from({ length: count }, (_, i) => createTestMedia({ id: `m${i + 1}`, spot_id: spotId, created_at: at(i + 1) }));

function renderEdit(spot: Spot, media: Media[]) {
  useSpotsStore.setState({ spots: [spot] });
  useMediaStore.setState({ mediaBySpot: media.length ? { [spot.id]: media } : {} });
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: spot.id });
  return render(<EditSpotScreen />);
}

async function addPhotos(...assets: ImagePickerAsset[]) {
  launch.mockResolvedValueOnce(picked(...assets));
  fireEvent.press(screen.getByLabelText('Add photos'));
  await waitFor(() => expect(screen.getAllByText('new')).toHaveLength(assets.length));
}

async function save() {
  fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(mockUpdateSpot).toHaveBeenCalledTimes(1));
  return (mockUpdateSpot.mock.calls[0] as unknown as [string, SpotUpdate])[1];
}

const savedStaged = () => mockSavePhotos.mock.calls[0][0];

describe('Edit spot: add photos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSavePhotos.mockImplementation(async (photos: NewPhoto[]) => photos.map(toMedia));
    mockRemovePhotos.mockImplementation(async (ids: string[]) => ids);
    requestPermission.mockResolvedValue(GRANTED);
    launch.mockResolvedValue({ canceled: true, assets: null });
    jest.mocked(useRouter).mockReturnValue({ push: jest.fn(), back: mockBack, replace: jest.fn(), dismissAll: jest.fn() } as never);
  });

  it("opens the photo library with multiple selection and EXIF from the 'Add photos' tile", async () => {
    // EXIF is what carries each photo's capture time and GPS.
    renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 2));

    fireEvent.press(screen.getByLabelText('Add photos'));

    await waitFor(() => expect(launch).toHaveBeenCalledTimes(1));
    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({ mediaTypes: ['images'], allowsMultipleSelection: true, exif: true, selectionLimit: 18 }),
    );
  });

  it("shows picked photos as 'new' tiles and writes them once on Save with EXIF time and GPS", async () => {
    // Picked photos are staged; Save writes them in one call and never moves the spot.
    renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 1));

    await addPhotos(A1, A2);
    expect(screen.getAllByTestId(/^photo-tile-\d+$/)).toHaveLength(3);
    expect(mockSavePhotos).not.toHaveBeenCalled();

    const patch = await save();

    expect(mockSavePhotos).toHaveBeenCalledTimes(1);
    const staged = savedStaged();
    expect(staged).toHaveLength(2);
    expect(staged[0]).toEqual(
      expect.objectContaining({
        spot_id: 's1',
        sourceUri: 'file:///picked/a1.jpg',
        captured_at: '2026-10-12T14:22:05',
        location: { latitude: 40.7, longitude: -74 },
      }),
    );
    expect(staged[1]).toEqual(
      expect.objectContaining({
        spot_id: 's1',
        sourceUri: 'file:///picked/a2.jpg',
        captured_at: '2026-10-13T09:05:00',
        location: { latitude: -33.9, longitude: 151.2 },
      }),
    );
    expect(staged[0].id).not.toBe(staged[1].id);
    expect(staged[0]).not.toHaveProperty('key');
    expect(patch).not.toHaveProperty('location');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('writes nothing when the sheet is dismissed without Save', async () => {
    // Staged photos are screen state only: leaving drops them.
    const { unmount } = renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 1));

    await addPhotos(A1);
    unmount();

    expect(mockSavePhotos).not.toHaveBeenCalled();
    expect(mockUpdateSpot).not.toHaveBeenCalled();
  });

  it('makes the first added photo primary when the spot had none', async () => {
    renderEdit(createTestSpot({ id: 's1' }), []);

    await addPhotos(A1);
    const patch = await save();

    expect(patch.primary_photo_id).toBe(savedStaged()[0].id);
  });

  it('leaves primary_photo_id out of the patch when the spot already has photos', async () => {
    renderEdit(createTestSpot({ id: 's1', primary_photo_id: 'm1' }), makeMedia('s1', 2));

    await addPhotos(A1);
    const patch = await save();

    expect(patch).not.toHaveProperty('primary_photo_id');
  });

  it('removes and adds in one Save, with the pending-removal hint beside the new tile', async () => {
    renderEdit(createTestSpot({ id: 's1', primary_photo_id: 'm1' }), makeMedia('s1', 2));

    fireEvent.press(screen.getByLabelText('Remove photo 2'));
    await addPhotos(A1);
    expect(screen.getByText('1 photo will be removed when you save.')).toBeTruthy();
    expect(screen.getByText('new')).toBeTruthy();

    await save();

    expect(mockRemovePhotos).toHaveBeenCalledWith(['m2']);
    expect(mockSavePhotos).toHaveBeenCalledTimes(1);
    expect(savedStaged()).toEqual([expect.objectContaining({ sourceUri: 'file:///picked/a1.jpg' })]);
  });

  it('makes the first added photo primary when every existing photo was removed', async () => {
    // The old primary is gone and nothing existing remains, so the new photo takes over.
    renderEdit(createTestSpot({ id: 's1', primary_photo_id: 'm1' }), makeMedia('s1', 1));

    fireEvent.press(screen.getByLabelText('Remove photo 1'));
    await addPhotos(A1);
    const patch = await save();

    expect(patch.primary_photo_id).toBe(savedStaged()[0].id);
  });

  it("asks for photo access and adds nothing when it's denied", async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    requestPermission.mockResolvedValue(DENIED);
    renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 1));

    fireEvent.press(screen.getByLabelText('Add photos'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(alertSpy.mock.calls[0][0]).toBe('Photo access needed');
    expect(launch).not.toHaveBeenCalled();
    expect(screen.queryByText('new')).toBeNull();
    alertSpy.mockRestore();
  });

  it('stages nothing when the picker is canceled', async () => {
    renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 1));

    fireEvent.press(screen.getByLabelText('Add photos'));
    await waitFor(() => expect(launch).toHaveBeenCalledTimes(1));
    await act(async () => {});

    expect(screen.queryByText('new')).toBeNull();
    expect(screen.getAllByTestId(/^photo-tile-\d+$/)).toHaveLength(1);
  });

  it('stages the same library photo once when it is picked twice', async () => {
    renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 1));

    await addPhotos(A1);
    launch.mockResolvedValueOnce(picked(A1, A2));
    fireEvent.press(screen.getByLabelText('Add photos'));
    await waitFor(() => expect(screen.getAllByText('new')).toHaveLength(2));
    await save();

    expect(savedStaged().map((d) => d.sourceUri)).toEqual(['file:///picked/a1.jpg', 'file:///picked/a2.jpg']);
  });

  it('opens the picker once on a double tap', async () => {
    renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 1));
    launch.mockResolvedValueOnce(picked(A1));

    fireEvent.press(screen.getByLabelText('Add photos'));
    fireEvent.press(screen.getByLabelText('Add photos'));
    await waitFor(() => expect(screen.getAllByText('new')).toHaveLength(1));

    expect(launch).toHaveBeenCalledTimes(1);
  });

  it("unstages a new photo from its ✕ so Save doesn't write it", async () => {
    renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 1));

    await addPhotos(A1);
    fireEvent.press(screen.getByLabelText('Remove photo 2'));
    expect(screen.queryByText('new')).toBeNull();
    // Unstaging a photo is not a pending removal of a saved photo.
    expect(screen.queryByText(/will be removed when you save/)).toBeNull();
    await save();

    expect(mockSavePhotos).not.toHaveBeenCalled();
    expect(mockRemovePhotos).not.toHaveBeenCalled();
  });

  it('hides the add tile at 20 photos', async () => {
    // APP_SPECIFICATIONS: at most 20 photos per spot.
    renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 19));

    await addPhotos(A1);

    expect(screen.queryByLabelText('Add photos')).toBeNull();
  });

  it("warns before closing when some photos couldn't be added", async () => {
    // savePhotos resolves only what it wrote; the sheet closes from the alert's OK, not before.
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockSavePhotos.mockImplementation(async (photos: NewPhoto[]) => photos.slice(1).map(toMedia));
    renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 1));

    await addPhotos(A1, A2);
    await save();

    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(alertSpy.mock.calls[0][0]).toBe("Some photos couldn't be added");
    expect(mockBack).not.toHaveBeenCalled();
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress: () => void }[];
    buttons[0].onPress();
    expect(mockBack).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });
  it('keeps the next existing photo primary when the primary is removed and photos are added', async () => {
    // Existing photos outrank new ones: m2 is what the user already saw second.
    renderEdit(createTestSpot({ id: 's1', primary_photo_id: 'm1' }), makeMedia('s1', 2));

    fireEvent.press(screen.getByLabelText('Remove photo 1'));
    await addPhotos(A1);
    const patch = await save();

    expect(patch.primary_photo_id).toBe('m2');
  });

  it('shows each saved photo once while the partial-failure alert is up', async () => {
    // savePhotos puts the saved rows in the store before the sheet closes; their staged copies must leave the grid.
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockSavePhotos.mockImplementation(async (photos: NewPhoto[]) => {
      const saved = photos.slice(1).map(toMedia);
      useMediaStore.getState().addMany(saved);
      return saved;
    });
    renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 1));

    await addPhotos(A1, A2);
    await save();
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));

    expect(screen.getAllByTestId(/^photo-tile-\d+$/)).toHaveLength(3);
    expect(screen.getAllByText('new')).toHaveLength(1);
    alertSpy.mockRestore();
  });

  it('does not write the photos again when Save is retried after the spot update failed', async () => {
    // The first Save already wrote them; a retry must only retry what failed.
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSavePhotos.mockImplementation(async (photos: NewPhoto[]) => {
      const saved = photos.map(toMedia);
      useMediaStore.getState().addMany(saved);
      return saved;
    });
    mockUpdateSpot.mockRejectedValueOnce(new Error('disk I/O error'));
    renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 1));

    await addPhotos(A1);
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("Couldn't save", 'Please try again.'));
    expect(screen.queryByText('new')).toBeNull();
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));

    expect(mockSavePhotos).toHaveBeenCalledTimes(1);
    // Only the failed update is logged: no duplicate-key warning from a photo shown as saved and as staged.
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it('does not open the picker while a save is running', async () => {
    // Photos picked then would be dropped when the sheet closes.
    let finish = () => {};
    mockUpdateSpot.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 1));

    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockUpdateSpot).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByLabelText('Add photos'));
    await act(async () => {});

    expect(requestPermission).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
    await act(async () => finish());
  });

  it('never saves past 20 photos when a staged removal fails', async () => {
    // The add used the slot the removal freed; if the photo is still there, the add would make 21.
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockRemovePhotos.mockImplementation(async () => []);
    renderEdit(createTestSpot({ id: 's1', primary_photo_id: 'm1' }), makeMedia('s1', 20));

    fireEvent.press(screen.getByLabelText('Remove photo 2'));
    await addPhotos(A1);
    await save();

    expect(mockSavePhotos).not.toHaveBeenCalled();
    await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(1));
    expect(alertSpy.mock.calls[0][0]).toBe("Some photo changes didn't save");
    alertSpy.mockRestore();
  });

  it('Undo never takes the grid past 20 photos: the newest added photos give way', async () => {
    // Two removals freed two slots for two picks; bringing the removed photos back would make 22.
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderEdit(createTestSpot({ id: 's1', primary_photo_id: 'm1' }), makeMedia('s1', 20));

    fireEvent.press(screen.getByLabelText('Remove photo 2'));
    fireEvent.press(screen.getByLabelText('Remove photo 2'));
    await addPhotos(A1, A2);
    fireEvent.press(screen.getByLabelText('Undo'));

    expect(screen.getAllByTestId(/^photo-tile-\d+$/)).toHaveLength(20);
    expect(screen.queryByText('new')).toBeNull();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toBe('20 photos per spot');
    alertSpy.mockClear();

    await save();
    expect(mockSavePhotos).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });

  it('Undo keeps the added photos that still fit under 20', async () => {
    renderEdit(createTestSpot({ id: 's1', primary_photo_id: 'm1' }), makeMedia('s1', 19));

    fireEvent.press(screen.getByLabelText('Remove photo 2'));
    await addPhotos(A1, A2);
    fireEvent.press(screen.getByLabelText('Undo'));

    expect(screen.getAllByTestId(/^photo-tile-\d+$/)).toHaveLength(20);
    expect(screen.getAllByText('new')).toHaveLength(1);
  });

  it('freezes the ✕ badges, Undo and Delete while Save runs', async () => {
    // Save already captured what to write; a change made now would show one thing and save another.
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    let finish = (_ids: string[]) => {};
    mockRemovePhotos.mockImplementationOnce(() => new Promise<string[]>((resolve) => (finish = resolve)));
    renderEdit(createTestSpot({ id: 's1', primary_photo_id: 'm1' }), makeMedia('s1', 2));

    fireEvent.press(screen.getByLabelText('Remove photo 1'));
    await addPhotos(A1);
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(mockRemovePhotos).toHaveBeenCalledTimes(1));

    fireEvent.press(screen.getByLabelText('Remove photo 2')); // the new one
    fireEvent.press(screen.getByLabelText('Remove photo 1'));
    fireEvent.press(screen.getByLabelText('Undo'));
    fireEvent.press(screen.getByText('Delete spot'));

    expect(screen.getAllByText('new')).toHaveLength(1);
    expect(screen.getAllByTestId(/^photo-tile-\d+$/)).toHaveLength(2);
    expect(screen.getByText('1 photo will be removed when you save.')).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
    await act(async () => finish(['m1']));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    alertSpy.mockRestore();
  });
});
