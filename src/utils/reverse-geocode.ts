import { reverseGeocodeAsync } from 'expo-location';

import type { GeoPoint, Spot } from '@/src/types';
import { isKnownLocation } from '@/src/utils/geo';

/**
 * The town for a point from Apple's geocoder via expo-location (D4): city, else subregion, else
 * region. CLGeocoder is a network service: the coordinates go to Apple and it needs internet.
 * Never throws; offline, rate-limited or unknown-location lookups give undefined.
 */
export async function geocodeTown(point: GeoPoint): Promise<string | undefined> {
  if (!isKnownLocation(point)) return undefined;
  try {
    const [address] = await reverseGeocodeAsync(point);
    return address?.city || address?.subregion || address?.region || undefined;
  } catch {
    return undefined;
  }
}

type UpdateSpot = (id: string, updates: Pick<Spot, 'generated_name'>) => Promise<void>;

/**
 * Names up to `limit` untitled, town-less spots, one request at a time (Apple's geocoder
 * throttles bursts). Spots that get no town keep their label and are retried next launch.
 */
export async function backfillTowns(spots: Spot[], updateSpot: UpdateSpot, limit = 10): Promise<void> {
  const pending = spots
    .filter((s) => !s.name && !s.generated_name && isKnownLocation(s.location))
    .slice(0, limit);
  for (const spot of pending) {
    const town = await geocodeTown(spot.location);
    if (town) await updateSpot(spot.id, { generated_name: town });
  }
}
