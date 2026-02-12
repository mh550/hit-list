import { v4 as uuid } from 'uuid';
import type { Spot, Media } from '@/src/types';
import { SpotStatus } from '@/src/types';

export function createTestSpot(overrides: Partial<Spot> = {}): Spot {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    location: { latitude: 47.6062, longitude: -122.3321 },
    created_at: now,
    updated_at: now,
    status: SpotStatus.Draft,
    feature: {},
    in_run: { setup_options: [] },
    landing: {},
    metadata: {},
    ...overrides,
  };
}

export function createTestMedia(overrides: Partial<Media> = {}): Media {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    spot_id: overrides.spot_id ?? uuid(),
    file_path: `/photos/${uuid()}.jpg`,
    created_at: now,
    ...overrides,
  };
}
