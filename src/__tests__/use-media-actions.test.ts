import { renderHook, act } from '@testing-library/react-native';
import { useMediaActions } from '@/src/hooks/use-media-actions';
import { useMediaStore, useSpotsStore } from '@/src/stores';
import { SIGNED_OUT, useAuthStore } from '@/src/stores/auth-store';
import { fakeFs as fs } from './helpers/fake-fs';
import { createTestMedia, createTestSpot } from './factories';

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

describe('useMediaActions.savePhotos', () => {
  const { insertMedia: mockInsertMedia } = jest.requireMock('@/src/db') as { insertMedia: jest.Mock };
  const draft = (id: string) => ({
    id,
    spot_id: 's1',
    sourceUri: `file:///picked/${id}.jpg`,
    captured_at: '2026-10-12T14:22:05',
    created_at: '2026-10-21T10:00:00.000Z',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockInsertMedia.mockResolvedValue(undefined);
    fs.__resetFs();
    fs.__putFile('file:///picked/n1.jpg');
    fs.__putFile('file:///picked/n2.jpg');
    useMediaStore.setState({ mediaBySpot: {} });
  });

  it('resolves the saved photos with their app-storage paths, in the order given', async () => {
    // Edit picks the new primary from this result, so it must be what was actually written.
    const { result } = renderHook(() => useMediaActions());

    let saved: unknown;
    await act(async () => {
      saved = await result.current.savePhotos([draft('n1'), draft('n2')]);
    });

    expect(saved).toEqual([
      expect.objectContaining({ id: 'n1', spot_id: 's1', file_path: 'photos/s1/n1.jpg', captured_at: '2026-10-12T14:22:05' }),
      expect.objectContaining({ id: 'n2', file_path: 'photos/s1/n2.jpg' }),
    ]);
    expect(useMediaStore.getState().mediaBySpot.s1.map((m) => m.id)).toEqual(['n1', 'n2']);
  });

  it('leaves a photo whose insert failed out of the result and the store, and keeps the others', async () => {
    // One bad row must not throw away the rest; the caller compares counts to warn the user.
    mockInsertMedia.mockImplementation(async (_db: unknown, m: { id: string }) => {
      if (m.id === 'n1') throw new Error('disk I/O error');
    });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useMediaActions());

    let saved: { id: string }[] = [];
    await act(async () => {
      saved = await result.current.savePhotos([draft('n1'), draft('n2')]);
    });

    expect(saved.map((m) => m.id)).toEqual(['n2']);
    expect(useMediaStore.getState().mediaBySpot.s1.map((m) => m.id)).toEqual(['n2']);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });
});

describe("useMediaActions: another rider's spot (S8, D47)", () => {
  const { insertMedia: mockInsertMedia } = jest.requireMock('@/src/db') as { insertMedia: jest.Mock };
  const theirs = createTestMedia({ id: 'm-ana', spot_id: 'anas', owner_id: 'u-ana' });

  beforeEach(() => {
    jest.clearAllMocks();
    fs.__resetFs();
    fs.__putFile('file:///picked/n1.jpg');
    useSpotsStore.setState({ spots: [createTestSpot({ id: 'anas', owner_id: 'u-ana' })] });
    useMediaStore.setState({ mediaBySpot: { anas: [theirs] } });
    useAuthStore.setState({ status: 'signed_in', userId: 'u-me', email: null, username: 'me', displayName: null });
  });
  afterEach(() => {
    useAuthStore.setState(SIGNED_OUT);
    useSpotsStore.setState({ spots: [] });
  });

  it("savePhotos and removePhotos reject with 'not your spot', nothing written or copied", async () => {
    const { result } = renderHook(() => useMediaActions());
    const draft = {
      id: 'n1',
      spot_id: 'anas',
      sourceUri: 'file:///picked/n1.jpg',
      created_at: '2026-10-21T10:00:00.000Z',
    };
    await expect(result.current.savePhotos([draft])).rejects.toThrow('not your spot');
    await expect(result.current.removePhotos(['m-ana'])).rejects.toThrow('not your spot');
    expect(mockInsertMedia).not.toHaveBeenCalled();
    expect(mockDeleteMedia).not.toHaveBeenCalled();
    expect(useMediaStore.getState().mediaBySpot).toEqual({ anas: [theirs] });
  });
});
