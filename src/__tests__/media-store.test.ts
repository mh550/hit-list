import { useMediaStore } from '@/src/stores';
import { createTestMedia } from './factories';

describe('media store', () => {
  beforeEach(() => useMediaStore.setState({ mediaBySpot: {} }));

  it('setAll groups media by spot', () => {
    const a = createTestMedia({ spot_id: 's1' });
    const b = createTestMedia({ spot_id: 's2' });

    useMediaStore.getState().setAll([a, b]);

    expect(useMediaStore.getState().mediaBySpot).toEqual({ s1: [a], s2: [b] });
  });

  it('addMany appends to each spot in the given order, in one update', () => {
    const existing = createTestMedia({ spot_id: 's1' });
    const a = createTestMedia({ spot_id: 's1' });
    const b = createTestMedia({ spot_id: 's2' });
    useMediaStore.getState().setAll([existing]);
    const listener = jest.fn();
    const unsubscribe = useMediaStore.subscribe(listener);

    useMediaStore.getState().addMany([a, b]);

    expect(useMediaStore.getState().mediaBySpot).toEqual({ s1: [existing, a], s2: [b] });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('addMany skips media the store already has (a sync reload may have read them first)', () => {
    const a = createTestMedia({ spot_id: 's1' });
    const b = createTestMedia({ spot_id: 's1' });
    useMediaStore.getState().setAll([a]);

    useMediaStore.getState().addMany([a, b]);

    expect(useMediaStore.getState().mediaBySpot).toEqual({ s1: [a, b] });
  });

  it('removeMany removes those media from any spot, keeping the rest in order, in one update', () => {
    // The Edit screen removes a spot's photos in one go; other photos and their order must survive.
    const a = createTestMedia({ spot_id: 's1' });
    const b = createTestMedia({ spot_id: 's1' });
    const c = createTestMedia({ spot_id: 's1' });
    const d = createTestMedia({ spot_id: 's2' });
    useMediaStore.getState().setAll([a, b, c, d]);
    const listener = jest.fn();
    const unsubscribe = useMediaStore.subscribe(listener);

    useMediaStore.getState().removeMany([b.id, d.id, 'unknown']);

    expect(useMediaStore.getState().mediaBySpot.s1).toEqual([a, c]);
    expect(useMediaStore.getState().mediaBySpot.s2 ?? []).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('removeMany([]) is a no-op: no notification and the same mediaBySpot object', () => {
    // Nothing to remove must not wake every subscriber or hand out a new map.
    useMediaStore.getState().setAll([createTestMedia({ spot_id: 's1' })]);
    const before = useMediaStore.getState().mediaBySpot;
    const listener = jest.fn();
    const unsubscribe = useMediaStore.subscribe(listener);

    useMediaStore.getState().removeMany([]);

    expect(listener).not.toHaveBeenCalled();
    expect(useMediaStore.getState().mediaBySpot).toBe(before);
    unsubscribe();
  });
});
