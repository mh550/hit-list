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
});
