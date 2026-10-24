import { newId } from '@/src/utils/id';
import type { GeoPoint, HitList, Spot, Media } from '@/src/types';

/** Cities hundreds of km apart: their pins never merge into a map cluster, whatever zoom initialRegion picks. */
export const CITIES = {
  seattle: { latitude: 47.6062, longitude: -122.3321 },
  portland: { latitude: 45.5152, longitude: -122.6784 },
  spokane: { latitude: 47.6588, longitude: -117.426 },
} satisfies Record<string, GeoPoint>;

export function createTestSpot(overrides: Partial<Spot> = {}): Spot {
  const now = new Date().toISOString();
  return {
    id: newId(),
    location: CITIES.seattle,
    created_at: now,
    updated_at: now,
    feature_types: [],
    stopped: false,
    ...overrides,
  };
}

export function createTestMedia(overrides: Partial<Media> = {}): Media {
  const now = new Date().toISOString();
  return {
    id: newId(),
    spot_id: overrides.spot_id ?? newId(),
    file_path: `/photos/${newId()}.jpg`,
    created_at: now,
    ...overrides,
  };
}

/** A live manual list named 'Downtown' with fixed timestamps (an update made now always sorts after them). */
export function createTestHitList(overrides: Partial<HitList> = {}): HitList {
  return {
    id: newId(),
    name: 'Downtown',
    kind: 'manual',
    shared: false,
    created_at: '2026-10-01T12:00:00.000Z',
    updated_at: '2026-10-01T12:00:00.000Z',
    ...overrides,
  };
}
