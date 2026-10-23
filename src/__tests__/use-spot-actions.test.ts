import { renderHook, act } from '@testing-library/react-native';
import { useSpotActions } from '@/src/hooks/use-spot-actions';
import { useSpotsStore } from '@/src/stores';
import { createTestSpot } from './factories';
import { INITIAL_SYNC, useSyncStore } from '@/src/stores/sync-store';
import { SIGNED_OUT, useAuthStore } from '@/src/stores/auth-store';
import { geocodeTown } from '@/src/utils/reverse-geocode';

jest.mock('@/src/utils/reverse-geocode', () => ({ geocodeTown: jest.fn().mockResolvedValue(undefined) }));

const mockInsertSpot = jest.fn().mockResolvedValue(undefined);
const mockUpdateSpot = jest.fn().mockResolvedValue(undefined);
const mockSoftDeleteSpot = jest.fn().mockResolvedValue(undefined);

jest.mock('expo-sqlite', () => ({
  useSQLiteContext: () => ({}),
  SQLiteProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/db', () => ({
  migrateDb: jest.fn().mockResolvedValue(undefined),
  getSpots: jest.fn().mockResolvedValue([]),
  getUserSettings: jest.fn().mockResolvedValue(null),
  insertSpot: (...args: any[]) => mockInsertSpot(...args),
  updateSpot: (...args: any[]) => mockUpdateSpot(...args),
  softDeleteSpot: (...args: any[]) => mockSoftDeleteSpot(...args),
  insertMedia: jest.fn().mockResolvedValue(undefined),
  saveUserSettings: jest.fn().mockResolvedValue(undefined),
}));

describe('useSpotActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSpotsStore.setState({ spots: [] });
  });

  it('addSpot updates store immediately (optimistic)', () => {
    const { result } = renderHook(() => useSpotActions());
    const spot = createTestSpot({ id: 'new-spot' });

    act(() => {
      result.current.addSpot(spot);
    });

    expect(useSpotsStore.getState().spots).toHaveLength(1);
    expect(useSpotsStore.getState().spots[0].id).toBe('new-spot');
  });

  it('addSpot writes to DB', async () => {
    const { result } = renderHook(() => useSpotActions());
    const spot = createTestSpot({ id: 'new-spot' });

    await act(async () => {
      await result.current.addSpot(spot);
    });

    expect(mockInsertSpot).toHaveBeenCalledWith(expect.anything(), spot);
  });

  it('updateSpot updates store immediately', () => {
    const spot = createTestSpot({ id: 'existing-spot', name: 'Old Name' });
    useSpotsStore.setState({ spots: [spot] });

    const { result } = renderHook(() => useSpotActions());

    act(() => {
      result.current.updateSpot('existing-spot', { name: 'New Name' });
    });

    expect(useSpotsStore.getState().spots[0].name).toBe('New Name');
  });

  it('updateSpot writes to DB', async () => {
    const spot = createTestSpot({ id: 'existing-spot' });
    useSpotsStore.setState({ spots: [spot] });

    const { result } = renderHook(() => useSpotActions());

    await act(async () => {
      await result.current.updateSpot('existing-spot', { name: 'New Name' });
    });

    // objectContaining: the hook also stamps updated_at (see the timestamp tests below).
    expect(mockUpdateSpot).toHaveBeenCalledWith(
      expect.anything(),
      'existing-spot',
      expect.objectContaining({ name: 'New Name' }),
    );
  });

  it('updateSpot puts the changed fields back in the store and rejects when the DB write fails', async () => {
    // Otherwise the edit shows as saved and silently reverts on the next launch; the caller must hear of it.
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const spot = createTestSpot({ id: 's1', name: 'Old Name', notes: undefined, generated_name: 'Seattle' });
    useSpotsStore.setState({ spots: [spot] });
    mockUpdateSpot.mockRejectedValueOnce(new Error('disk I/O error'));
    const { result } = renderHook(() => useSpotActions());

    await act(async () => {
      await expect(
        result.current.updateSpot('s1', { name: 'New Name', notes: 'n', stopped: !spot.stopped }),
      ).rejects.toThrow('disk I/O error');
    });

    expect(useSpotsStore.getState().spots[0]).toEqual(spot);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });

  it('a failed rollback keeps fields another update changed meanwhile', async () => {
    // A town backfill can land while the edit's write is in flight; undoing the edit must not undo the town.
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    useSpotsStore.setState({ spots: [createTestSpot({ id: 's1', name: 'Old Name', generated_name: undefined })] });
    let fail = (_e: Error) => {};
    mockUpdateSpot.mockImplementationOnce(() => new Promise((_resolve, reject) => (fail = reject)));
    const { result } = renderHook(() => useSpotActions());

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.updateSpot('s1', { name: 'New Name' });
    });
    await act(async () => {
      await result.current.updateSpot('s1', { generated_name: 'Seattle' });
    });
    await act(async () => {
      fail(new Error('disk I/O error'));
      await pending.catch(() => {});
    });

    const after = useSpotsStore.getState().spots[0];
    expect(after.name).toBe('Old Name');
    expect(after.generated_name).toBe('Seattle');
    consoleSpy.mockRestore();
  });

  it('removeSpot removes from store immediately', () => {
    const spot = createTestSpot({ id: 'doomed-spot' });
    useSpotsStore.setState({ spots: [spot] });

    const { result } = renderHook(() => useSpotActions());

    act(() => {
      result.current.removeSpot('doomed-spot');
    });

    expect(useSpotsStore.getState().spots).toHaveLength(0);
  });

  it('removeSpot soft-deletes in DB', async () => {
    const spot = createTestSpot({ id: 'doomed-spot' });
    useSpotsStore.setState({ spots: [spot] });

    const { result } = renderHook(() => useSpotActions());

    await act(async () => {
      await result.current.removeSpot('doomed-spot');
    });

    // The hook also passes the shared `at` timestamp (see the timestamp tests below).
    expect(mockSoftDeleteSpot).toHaveBeenCalledWith(expect.anything(), 'doomed-spot', expect.any(String));
  });

  it('addSpot takes the spot back out of the store and rejects when the DB write fails', async () => {
    // A spot the DB never got would show until the next launch, and every photo saved to it would fail its foreign key.
    mockInsertSpot.mockRejectedValueOnce(new Error('DB write failed'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useSpotActions());
    const spot = createTestSpot({ id: 'spot-with-error' });

    await act(async () => {
      await expect(result.current.addSpot(spot)).rejects.toThrow('DB write failed');
    });

    expect(useSpotsStore.getState().spots).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  describe('timestamps', () => {
    const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    const NOW = new Date('2026-10-15T12:34:56.789Z');

    beforeEach(() => jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] }));
    afterEach(() => jest.useRealTimers());

    it('updateSpot without updated_at stamps one ISO time and gives the same value to the store and the DB', async () => {
      // Backfills (town, primary photo) pass no updated_at; memory and DB must not disagree until relaunch.
      useSpotsStore.setState({ spots: [createTestSpot({ id: 's1', updated_at: '2026-01-01T00:00:00.000Z' })] });
      const { result } = renderHook(() => useSpotActions());

      await act(async () => {
        await result.current.updateSpot('s1', { name: 'x' });
      });

      const storeValue = useSpotsStore.getState().spots[0].updated_at;
      const dbValue = mockUpdateSpot.mock.calls[0][2].updated_at;
      expect(storeValue).toMatch(ISO_Z);
      expect(dbValue).toBe(storeValue);
      expect(storeValue).toBe(NOW.toISOString());
    });

    it('updateSpot with an explicit updated_at passes it unchanged to the store and the DB', async () => {
      // The Edit screen's own stamp must win over the hook's clock.
      useSpotsStore.setState({ spots: [createTestSpot({ id: 's1' })] });
      const { result } = renderHook(() => useSpotActions());
      const stamp = '2026-10-15T08:00:00.000Z';

      await act(async () => {
        await result.current.updateSpot('s1', { name: 'x', updated_at: stamp });
      });

      expect(useSpotsStore.getState().spots[0].updated_at).toBe(stamp);
      expect(mockUpdateSpot.mock.calls[0][2].updated_at).toBe(stamp);
    });

    it('removeSpot passes one ISO `at` to softDeleteSpot', async () => {
      // The DB must not fall back to datetime('now'); the hook supplies the ISO time (the store only drops the spot).
      useSpotsStore.setState({ spots: [createTestSpot({ id: 's1' })] });
      const { result } = renderHook(() => useSpotActions());

      await act(async () => {
        await result.current.removeSpot('s1');
      });

      expect(mockSoftDeleteSpot).toHaveBeenCalledWith(expect.anything(), 's1', NOW.toISOString());
    });
  });

  describe('owner and town (S5-06)', () => {
    afterEach(() => useSyncStore.setState(INITIAL_SYNC));

    it('addSpot gives a new spot the adopted rider as owner, in the store and the DB', async () => {
      useSyncStore.setState({ adoptedUserId: 'rider-me' });
      const { result } = renderHook(() => useSpotActions());

      await act(async () => {
        await result.current.addSpot(createTestSpot({ id: 'n1' }));
      });

      expect(mockInsertSpot).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'n1', owner_id: 'rider-me' }));
      expect(useSpotsStore.getState().spots[0].owner_id).toBe('rider-me');
    });

    it('with no adopted rider (signed out, or adoption not done yet) a new spot has no owner', async () => {
      const { result } = renderHook(() => useSpotActions());

      await act(async () => {
        await result.current.addSpot(createTestSpot({ id: 'n1' }));
      });

      expect(mockInsertSpot.mock.calls[0][1].owner_id).toBeUndefined();
    });

    it("the new spot's town keeps its updated_at, so it never outranks a newer edit from another phone", async () => {
      jest.mocked(geocodeTown).mockResolvedValueOnce('Seattle');
      const spot = createTestSpot({ id: 'n1', updated_at: '2026-10-20T10:00:00.000Z' });
      const { result } = renderHook(() => useSpotActions());

      await act(async () => {
        await result.current.addSpot(spot);
      });

      expect(mockUpdateSpot).toHaveBeenCalledWith(expect.anything(), 'n1', {
        generated_name: 'Seattle',
        updated_at: '2026-10-20T10:00:00.000Z',
      });
    });

    it("setTown (the launch backfill) keeps the spot's current updated_at", async () => {
      useSpotsStore.setState({ spots: [createTestSpot({ id: 's1', updated_at: '2026-10-21T09:00:00.000Z' })] });
      const { result } = renderHook(() => useSpotActions());

      await act(async () => {
        await result.current.setTown('s1', 'Tacoma');
      });

      expect(mockUpdateSpot).toHaveBeenCalledWith(expect.anything(), 's1', {
        generated_name: 'Tacoma',
        updated_at: '2026-10-21T09:00:00.000Z',
      });
      expect(useSpotsStore.getState().spots[0].generated_name).toBe('Tacoma');
    });
  });

  describe("another rider's spot (S8, D47)", () => {
    const anas = createTestSpot({ id: 'anas', name: "Ana's ledge", owner_id: 'u-ana' });
    beforeEach(() => {
      useSpotsStore.setState({ spots: [anas] });
      useAuthStore.setState({ status: 'signed_in', userId: 'u-me', email: null, username: 'me', displayName: null });
    });
    afterEach(() => useAuthStore.setState(SIGNED_OUT));

    it("updateSpot, setTown and removeSpot reject with 'not your spot' and write nothing", async () => {
      const { result } = renderHook(() => useSpotActions());
      await expect(result.current.updateSpot('anas', { name: 'Mine now' })).rejects.toThrow('not your spot');
      await expect(result.current.setTown('anas', 'Tacoma')).rejects.toThrow('not your spot');
      await expect(result.current.removeSpot('anas')).rejects.toThrow('not your spot');
      expect(mockUpdateSpot).not.toHaveBeenCalled();
      expect(mockSoftDeleteSpot).not.toHaveBeenCalled();
      expect(useSpotsStore.getState().spots).toEqual([anas]);
    });

    it("signed out (an offline launch, an ended session) the phone's account still decides: others' spots stay read-only", async () => {
      useAuthStore.setState(SIGNED_OUT);
      useSyncStore.setState({ phoneUserId: 'u-me' });
      const { result } = renderHook(() => useSpotActions());
      await expect(result.current.updateSpot('anas', { name: 'Mine now' })).rejects.toThrow('not your spot');
      expect(mockUpdateSpot).not.toHaveBeenCalled();
      useSyncStore.setState(INITIAL_SYNC);
    });

    it("the rider's own and phone-only spots still update", async () => {
      useSpotsStore.setState({ spots: [{ ...anas, owner_id: 'u-me' }, createTestSpot({ id: 'phone' })] });
      const { result } = renderHook(() => useSpotActions());
      await act(async () => {
        await result.current.updateSpot('anas', { name: 'Mine' });
        await result.current.updateSpot('phone', { name: 'Phone' });
      });
      expect(mockUpdateSpot).toHaveBeenCalledTimes(2);
    });
  });
});
