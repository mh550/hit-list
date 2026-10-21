import { newId } from '@/src/utils/id';
import type { GeoPoint, Spot, Media } from '@/src/types';

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
    feature: {},
    in_run: {},
    landing: {},
    metadata: {},
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
