import { renderHook, act } from '@testing-library/react-native';
import { useMediaActions } from '@/src/hooks/use-media-actions';
import { useMediaStore } from '@/src/stores';
import { fakeFs as fs } from './helpers/fake-fs';
import { createTestMedia } from './factories';

const mockDeleteMedia = jest.fn(async (_db: unknown, _id: string) => {});
const mockDb = {};

jest.mock('expo-sqlite', () => ({
  useSQLiteContext: () => mockDb,
  SQLiteProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/db', () => ({
  insertMedia: jest.fn().mockResolvedValue(undefined),
  deleteMedia: (db: unknown, id: string) => mockDeleteMedia(db, id),
}));

describe('useMediaActions.removePhotos', () => {
  const a = createTestMedia({ id: 'a', spot_id: 's1' });
  const b = createTestMedia({ id: 'b', spot_id: 's1' });
  const c = createTestMedia({ id: 'c', spot_id: 's1' });
  const other = createTestMedia({ id: 'o', spot_id: 's2' });

  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteMedia.mockImplementation(async () => {});
    fs.__resetFs();
    useMediaStore.setState({ mediaBySpot: { s1: [a, b, c], s2: [other] } });
  });

  it('deletes each row in the DB and removes those photos from the store, keeping the rest in order', async () => {
    // The happy path: DB rows go, other photos (same and other spots) are untouched.
    const { result } = renderHook(() => useMediaActions());

    let removed: string[] = [];
    await act(async () => {
      removed = await result.current.removePhotos(['a', 'c']);
    });

    expect(mockDeleteMedia).toHaveBeenCalledTimes(2);
    expect(mockDeleteMedia).toHaveBeenCalledWith(mockDb, 'a');
    expect(mockDeleteMedia).toHaveBeenCalledWith(mockDb, 'c');
    expect(removed).toEqual(['a', 'c']);
    expect(useMediaStore.getState().mediaBySpot).toEqual({ s1: [b], s2: [other] });
  });

  it('keeps a photo in the store when its delete fails, logs the error, and resolves only the removed ids', async () => {
    // DB first: a row that is still in the DB must stay visible, and a failure must not reject the whole save.
    mockDeleteMedia.mockImplementation(async (_db, id) => {
      if (id === 'b') throw new Error('disk I/O error');
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useMediaActions());

    let removed: string[] = [];
    await act(async () => {
      removed = await result.current.removePhotos(['a', 'b', 'c']);
    });

    expect(removed).toEqual(['a', 'c']);
    expect(useMediaStore.getState().mediaBySpot.s1).toEqual([b]);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });

  it('never deletes the photo file in app storage (D3: only the media row goes)', async () => {
    // The fake fs has no delete API, so this checks the files are still there afterwards.
    fs.__putFile(a.file_path);
    const { result } = renderHook(() => useMediaActions());

    await act(async () => {
      await result.current.removePhotos(['a']);
    });

    expect(fs.__fileExists(a.file_path)).toBe(true);
  });
});
