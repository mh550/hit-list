import { reverseGeocodeAsync } from 'expo-location';

import type { GeoPoint, Spot } from '@/src/types';
import { isKnownLocation } from '@/src/utils/geo';

async function lookupTown(point: GeoPoint): Promise<string | undefined> {
  if (!isKnownLocation(point)) return undefined;
  try {
    const [address] = await reverseGeocodeAsync(point);
    return address?.city || address?.subregion || address?.region || undefined;
  } catch {
    return undefined;
  }
}

// Every lookup (new spots, imports, the launch backfill) waits for the previous one: Apple's
// geocoder throttles bursts and fails the excess.
let queue: Promise<unknown> = Promise.resolve();

/**
 * The town for a point from Apple's geocoder via expo-location (D4): city, else subregion, else
 * region. CLGeocoder is a network service: the coordinates go to Apple and it needs internet.
 * Never throws; offline, throttled or unknown-location lookups give undefined.
 */
export function geocodeTown(point: GeoPoint): Promise<string | undefined> {
  const result = queue.then(() => lookupTown(point));
  queue = result;
  return result;
}

/** Stores a spot's town without moving its updated_at (useSpotActions.setTown). */
type SetTown = (id: string, town: string) => Promise<void>;

/**
 * Names up to `limit` untitled, town-less spots, one request at a time (Apple's geocoder
 * throttles bursts). Spots that get no town keep their label and are retried next launch.
 */
export async function backfillTowns(spots: Spot[], setTown: SetTown, limit = 10): Promise<void> {
  const pending = spots
    .filter((s) => !s.name && !s.generated_name && isKnownLocation(s.location))
    .slice(0, limit);
  for (const spot of pending) {
    const town = await geocodeTown(spot.location);
    if (!town) continue;
    try {
      await setTown(spot.id, town);
    } catch {
      // setTown logged it; this spot is retried next launch.
    }
  }
}
