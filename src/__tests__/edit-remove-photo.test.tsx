import { AccessibilityInfo, Alert } from 'react-native';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
const mockBack = jest.fn();
const removePhoto = (n: number) => fireEvent.press(screen.getByLabelText(`Remove photo ${n}`));

async function save() {
  fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(mockUpdateSpot).toHaveBeenCalledTimes(1));
  return (mockUpdateSpot.mock.calls[0] as unknown as [string, SpotUpdate])[1];
}

describe('Edit spot: remove a photo', () => {
  beforeEach(() => {
    mockUpdateSpot.mockClear();
    mockRemovePhotos.mockReset();
    mockRemovePhotos.mockImplementation(async (ids: string[]) => ids);
    mockBack.mockClear();
    jest.mocked(useRouter).mockReturnValue({ push: jest.fn(), back: mockBack, replace: jest.fn(), dismissAll: jest.fn() } as never);
  });

  it('shows no photo tiles and no remove controls for a spot without photos', () => {
    // Nothing to remove, so the grid must not add empty space to the form.
    renderEdit(createTestSpot({ id: 's1' }), []);

    expect(screen.queryByTestId('photo-tile-0')).toBeNull();
    expect(removeLabels()).toEqual([]);
  });

  it('shows no section header and one numbered remove control per grid tile', () => {
    // Each photo needs its own accessible remove control, numbered 1..n; spec §2.2 drops the "Photos" header.
    renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 3));

    expect(screen.queryByText('Photos')).toBeNull();
    expect(screen.getAllByTestId(/^photo-tile-\d+$/)).toHaveLength(3);
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

  describe('pending-removal notice and Undo', () => {
    const notice = (text: string) => screen.queryByText(text);
    const undoButton = () => screen.queryByRole('button', { name: 'Undo' });

    it('shows no notice and no Undo while nothing is staged', () => {
      // The notice only exists to flag pending work, so it must not show on a pristine form.
      renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 3));

      expect(screen.queryByText(/will be removed when you save/)).toBeNull();
      expect(undoButton()).toBeNull();
    });

    it('says "1 photo will be removed when you save." with an Undo button after staging one photo', () => {
      // Without a visible pending state users swipe the sheet away believing the removal is done.
      renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 3));

      removePhoto(1);

      expect(notice('1 photo will be removed when you save.')).toBeOnTheScreen();
      expect(undoButton()).toBeOnTheScreen();
    });

    it('pluralises the notice: "2 photos will be removed when you save."', () => {
      // Count and plural form must track the number staged.
      renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 3));

      removePhoto(1);
      removePhoto(1);

      expect(notice('2 photos will be removed when you save.')).toBeOnTheScreen();
      expect(notice('1 photo will be removed when you save.')).toBeNull();
    });

    it('Undo restores every staged photo: controls come back and the notice disappears', () => {
      // A wrong tap must be recoverable without discarding every other edit in the form.
      renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 3));
      removePhoto(1);
      removePhoto(1);
      expect(removeLabels()).toEqual(['Remove photo 1']);

      fireEvent.press(screen.getByRole('button', { name: 'Undo' }));

      expect(removeLabels()).toEqual(['Remove photo 1', 'Remove photo 2', 'Remove photo 3']);
      expect(screen.queryByText(/will be removed when you save/)).toBeNull();
      expect(undoButton()).toBeNull();
    });

    it('when every photo is staged, shows the counted notice with Undo and not the old "All photos" text', () => {
      // Staging everything must stay reversible, and the count wording replaces the old all-photos hint.
      renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 3));

      removePhoto(1);
      removePhoto(1);
      removePhoto(1);

      expect(removeLabels()).toEqual([]);
      expect(notice('3 photos will be removed when you save.')).toBeOnTheScreen();
      expect(notice('All photos will be removed when you save.')).toBeNull();
      expect(undoButton()).toBeOnTheScreen();

      fireEvent.press(screen.getByRole('button', { name: 'Undo' }));

      expect(removeLabels()).toHaveLength(3);
    });

    it('Undo then Save deletes nothing', async () => {
      // Undo must clear the staged ids themselves, not just hide the notice.
      renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 3));
      removePhoto(1);
      fireEvent.press(screen.getByRole('button', { name: 'Undo' }));

      await save();

      expect(mockRemovePhotos).not.toHaveBeenCalled();
    });
  });

  it('runs Save once when pressed twice before the delete finishes', async () => {
    // Save awaits the deletes before router.back(), so a double tap would otherwise delete and update twice.
    let resolveRemove!: (ids: string[]) => void;
    mockRemovePhotos.mockImplementation(() => new Promise<string[]>((resolve) => { resolveRemove = resolve; }));
    renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 3));
    removePhoto(1);

    fireEvent.press(screen.getByText('Save'));
    fireEvent.press(screen.getByText('Save'));
    await act(async () => {
      resolveRemove(['m1']);
    });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    await act(async () => {}); // let any second run finish before counting

    expect(mockRemovePhotos).toHaveBeenCalledTimes(1);
    expect(mockUpdateSpot).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  describe('partial delete failure', () => {
    let alertSpy: jest.SpyInstance;
    beforeEach(() => {
      alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    });
    afterEach(() => alertSpy.mockRestore());

    it('alerts "Some photos couldn\'t be removed" when fewer ids were deleted than staged, and still saves', async () => {
      // A failed delete used to be silent; the user must hear that a photo is still there.
      renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 3));
      removePhoto(1);
      removePhoto(1);
      mockRemovePhotos.mockResolvedValueOnce(['m1']);

      await save();

      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(alertSpy.mock.calls[0][0]).toMatch(/couldn.t be removed/i);
      expect(mockUpdateSpot).toHaveBeenCalledTimes(1);

      // The sheet closes from the alert's OK, so dismissing the sheet can't swallow the alert on iOS.
      expect(mockBack).not.toHaveBeenCalled();
      const buttons = alertSpy.mock.calls[0][2] as { text?: string; onPress?: () => void }[];
      buttons.find((b) => b.text === 'OK')?.onPress?.();
      expect(mockBack).toHaveBeenCalledTimes(1);
    });

    it('does not alert when every staged photo was deleted', async () => {
      // The warning is only for failures; a clean save stays quiet.
      renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 3));
      removePhoto(1);
      removePhoto(1);

      await save();

      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('keeps the primary when the primary delete failed but another staged photo was deleted', async () => {
      // Guard for "use only the ids actually deleted": m1 (primary) survives, so primary_photo_id must not move.
      renderEdit(createTestSpot({ id: 's1', primary_photo_id: 'm1' }), makeMedia('s1', 3));
      removePhoto(1); // m1
      removePhoto(1); // m2
      mockRemovePhotos.mockResolvedValueOnce(['m2']);

      const updates = await save();

      expect(mockRemovePhotos).toHaveBeenCalledWith(['m1', 'm2']);
      expect(updates.primary_photo_id).toBeUndefined();
    });
  });

  it('announces "Photo will be removed when you save" to VoiceOver when a photo is staged', () => {
    // A sighted-only disappearance gives screen-reader users no sign that anything happened.
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 3));

    removePhoto(1);

    expect(announce).toHaveBeenCalledWith('Photo will be removed when you save');
    announce.mockRestore();
  });

  it('stages a photo once when its remove control is pressed twice in one batch', async () => {
    // A fast double tap fires before re-render, so the same id must not be appended twice.
    renderEdit(createTestSpot({ id: 's1' }), makeMedia('s1', 3));
    const control = screen.getByLabelText('Remove photo 1');

    act(() => {
      fireEvent.press(control);
      fireEvent.press(control);
    });
    await save();

    expect(mockRemovePhotos).toHaveBeenCalledTimes(1);
    expect(mockRemovePhotos).toHaveBeenCalledWith(['m1']);
  });
});
