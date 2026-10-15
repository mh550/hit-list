import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMediaStore, useSpotsStore } from '@/src/stores';
import type { Media, Spot, SpotUpdate } from '@/src/types';
import { createTestMedia, createTestSpot } from './factories';

const mockUpdateSpot = jest.fn(async () => {});
jest.mock('@/src/hooks/use-spot-actions', () => ({
  useSpotActions: () => ({ updateSpot: mockUpdateSpot, addSpot: jest.fn(), removeSpot: jest.fn() }),
}));

// removePhotos resolves to the ids it was given, as a fully successful delete would.
const mockRemovePhotos = jest.fn(async (ids: string[]) => ids);
jest.mock('@/src/hooks/use-media-actions', () => ({
  useMediaActions: () => ({ removePhotos: mockRemovePhotos, savePhotos: jest.fn() }),
}));

import EditSpotScreen from '@/app/spot/[id]/edit';

const at = (min: number) => `2026-10-15T09:${String(min).padStart(2, '0')}:00.000Z`;

function makeMedia(spotId: string, count: number): Media[] {
  return Array.from({ length: count }, (_, i) =>
    createTestMedia({ id: `m${i + 1}`, spot_id: spotId, created_at: at(i + 1) }),
  );
}

function renderEdit(spot: Spot, media: Media[]) {
  useSpotsStore.setState({ spots: [spot] });
  useMediaStore.setState({ mediaBySpot: media.length ? { [spot.id]: media } : {} });
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: spot.id });
  render(<EditSpotScreen />);
}

const removeLabels = () =>
  screen.queryAllByLabelText(/^Remove photo \d+$/).map((n) => n.props.accessibilityLabel as string);
const removePhoto = (n: number) => fireEvent.press(screen.getByLabelText(`Remove photo ${n}`));

async function save() {
  fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(mockUpdateSpot).toHaveBeenCalledTimes(1));
  return (mockUpdateSpot.mock.calls[0] as unknown as [string, SpotUpdate])[1];
}

describe('Edit spot: remove a photo', () => {
  beforeEach(() => {
    mockUpdateSpot.mockClear();
    mockRemovePhotos.mockClear();
  });

  it('shows no Photos section and no remove controls for a spot without photos', () => {
    // Nothing to remove, so the section must not add an empty heading to the form.
    renderEdit(createTestSpot({ id: 's1' }), []);

    expect(screen.queryByText('Photos')).toBeNull();
    expect(removeLabels()).toEqual([]);
  });

  it('shows a Photos heading and one numbered remove control per photo', () => {
    // Each photo needs its own accessible remove control, numbered 1..n.
    renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 3));

    expect(screen.getByText('Photos')).toBeOnTheScreen();
    expect(removeLabels()).toEqual(['Remove photo 1', 'Remove photo 2', 'Remove photo 3']);
  });

  it('numbers the controls in spotPhotos order, primary first', async () => {
    // Remove photo 1 must be the primary (shown first), not the oldest.
    const media = makeMedia('s1', 3);
    renderEdit(createTestSpot({ id: 's1', primary_photo_id: 'm2' }), media);

    removePhoto(1);
    await save();

    expect(mockRemovePhotos).toHaveBeenCalledWith(['m2']);
  });

  it('hides a photo as soon as its remove control is pressed and renumbers the rest', () => {
    // Staging is immediate feedback in the form: two photos, remove one, one control is left.
    renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 2));

    removePhoto(2);

    expect(removeLabels()).toEqual(['Remove photo 1']);
  });

  it('deletes nothing until Save is pressed', () => {
    // Cancel/back must undo a staged removal like any other field, so no delete or update may happen yet.
    renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 3));

    removePhoto(1);
    removePhoto(1);

    expect(mockRemovePhotos).not.toHaveBeenCalled();
    expect(mockUpdateSpot).not.toHaveBeenCalled();
  });

  it('calls removePhotos with the staged ids, then updateSpot, leaving primary_photo_id unchanged when the primary stays', async () => {
    // A non-primary photo goes; the primary must not be rewritten (key left undefined).
    const media = makeMedia('s1', 3);
    renderEdit(createTestSpot({ id: 's1', primary_photo_id: 'm2' }), media);
    // Display order is [m2, m1, m3]; control 3 is m3.
    removePhoto(3);

    const updates = await save();

    expect(mockRemovePhotos).toHaveBeenCalledTimes(1);
    expect(mockRemovePhotos).toHaveBeenCalledWith(['m3']);
    expect(mockRemovePhotos.mock.invocationCallOrder[0]).toBeLessThan(mockUpdateSpot.mock.invocationCallOrder[0]);
    expect((mockUpdateSpot.mock.calls[0] as unknown as [string, SpotUpdate])[0]).toBe('s1');
    expect(updates.primary_photo_id).toBeUndefined();
  });

  it('makes the first remaining photo in display order the primary when the primary is removed', async () => {
    // The spot must not keep pointing at a deleted row.
    const media = makeMedia('s1', 3);
    renderEdit(createTestSpot({ id: 's1', primary_photo_id: 'm2' }), media);
    // Display order is [m2, m1, m3]; removing control 1 (m2) leaves [m1, m3].
    removePhoto(1);

    const updates = await save();

    expect(mockRemovePhotos).toHaveBeenCalledWith(['m2']);
    expect(updates.primary_photo_id).toBe('m1');
  });

  it('clears primary_photo_id to null when every photo is removed', async () => {
    // With no photos left there is no primary; null (not undefined) makes the DB layer clear the column.
    const media = makeMedia('s1', 2);
    renderEdit(createTestSpot({ id: 's1', primary_photo_id: 'm1' }), media);
    removePhoto(1);
    removePhoto(1);

    const updates = await save();

    expect(mockRemovePhotos).toHaveBeenCalledTimes(1);
    expect([...(mockRemovePhotos.mock.calls[0][0] as string[])].sort()).toEqual(['m1', 'm2']);
    expect(updates.primary_photo_id).toBeNull();
  });
});
