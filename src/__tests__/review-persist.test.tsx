import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { reverseGeocodeAsync } from 'expo-location';
import { fakeFs as fs } from './helpers/fake-fs';
import { useMediaStore, useSpotsStore } from '@/src/stores';
import type { Media } from '@/src/types';
import type { ImportPhoto } from '@/src/utils/import-clustering';

const mockDismissAll = jest.fn();
const setParams = (params: Record<string, string>) =>
  jest.mocked(useLocalSearchParams).mockReturnValue(params as never);

jest.mock('expo-sqlite', () => ({ useSQLiteContext: () => ({}) }));

const mockInsertMedia = jest.fn().mockResolvedValue(undefined);
const mockUpdateSpot = jest.fn().mockResolvedValue(undefined);
jest.mock('@/src/db', () => ({
  insertSpot: jest.fn().mockResolvedValue(undefined),
  insertMedia: (...args: unknown[]) => mockInsertMedia(...args),
  updateSpot: (...args: unknown[]) => mockUpdateSpot(...args),
}));

import QuickAddReview from '@/app/add/review';
import ImportReview from '@/app/import/review';

const insertedMedia = (): Media[] => mockInsertMedia.mock.calls.map(([, m]) => m as Media);
const RELATIVE = /^photos\/[^/]+\/[^/]+\.jpg$/;

describe('review screens persist photos before saving (D3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.__resetFs();
    useMediaStore.setState({ mediaBySpot: {} });
    useSpotsStore.setState({ spots: [] });
    jest.mocked(useRouter).mockReturnValue({ dismissAll: mockDismissAll, push: jest.fn(), back: jest.fn() } as never);
  });

  it('Quick Add stores relative photo paths and fills the media store', async () => {
    setParams({ photoUris: 'file:///c/a.jpg,file:///c/b.jpg', latitude: '47.6', longitude: '-122.3' });
    fs.__putFile('file:///c/a.jpg');
    fs.__putFile('file:///c/b.jpg');

    render(<QuickAddReview />);
    fireEvent.press(screen.getByText('Save as Draft'));
    await waitFor(() => expect(mockDismissAll).toHaveBeenCalled());

    const media = insertedMedia();
    expect(media).toHaveLength(2);
    expect(media.every((m) => RELATIVE.test(m.file_path))).toBe(true);
    expect(media.every((m) => fs.__fileExists(`file:///data/Documents/${m.file_path}`))).toBe(true);
    expect(useMediaStore.getState().mediaBySpot[media[0].spot_id]).toHaveLength(2);
  });

  it('Import stores relative photo paths and fills the media store', async () => {
    const group: ImportPhoto[] = [
      { uri: 'file:///c/i1.jpg', location: { latitude: 47.6, longitude: -122.3 }, capturedAt: '2026-10-13T14:22:01' },
    ];
    setParams({ groupsJson: JSON.stringify([group]) });
    fs.__putFile('file:///c/i1.jpg');

    render(<ImportReview />);
    fireEvent.press(screen.getByText('Import 1 Spot'));
    await waitFor(() => expect(mockDismissAll).toHaveBeenCalled());

    const [m] = insertedMedia();
    expect(m.file_path).toMatch(RELATIVE);
    // Left blank, the spot stays untitled so it shows the D4 label and gets its town (not "Spot 1").
    expect(useSpotsStore.getState().spots[0].name).toBeUndefined();
    expect(useMediaStore.getState().mediaBySpot[m.spot_id]).toEqual([m]);
  });

  it('still saves the media row with the original URI when the copy fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    setParams({ photoUris: 'file:///c/gone.jpg', latitude: '0', longitude: '0' }); // never created

    render(<QuickAddReview />);
    fireEvent.press(screen.getByText('Save as Draft'));
    await waitFor(() => expect(mockDismissAll).toHaveBeenCalled());

    expect(insertedMedia().map((m) => m.file_path)).toEqual(['file:///c/gone.jpg']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('looks up the town after a save and stores it as generated_name', async () => {
    jest.mocked(reverseGeocodeAsync).mockResolvedValueOnce([{ city: 'Seattle' }] as never);
    setParams({ photoUris: '', latitude: '47.6', longitude: '-122.3' });

    render(<QuickAddReview />);
    fireEvent.press(screen.getByText('Save as Draft'));

    await waitFor(() =>
      expect(mockUpdateSpot).toHaveBeenCalledWith(expect.anything(), expect.any(String), { generated_name: 'Seattle' }),
    );
    const [spot] = useSpotsStore.getState().spots;
    expect(spot.generated_name).toBe('Seattle');
  });
});
