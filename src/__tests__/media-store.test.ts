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

  it('add keeps a spot\'s media in capture order', () => {
    const later = createTestMedia({ spot_id: 's1', created_at: '2026-10-13T12:00:00.000Z' });
    const earlier = createTestMedia({ spot_id: 's1', created_at: '2026-10-13T11:00:00.000Z' });

    useMediaStore.getState().add(later);
    useMediaStore.getState().add(earlier);

    expect(useMediaStore.getState().mediaBySpot.s1).toEqual([earlier, later]);
  });

  it('remove drops one row and leaves the rest', () => {
    const a = createTestMedia({ spot_id: 's1' });
    const b = createTestMedia({ spot_id: 's1' });
    useMediaStore.getState().setAll([a, b]);

    useMediaStore.getState().remove(a.id);

    expect(useMediaStore.getState().mediaBySpot.s1).toEqual([b]);
  });
});
