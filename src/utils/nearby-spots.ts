import type { GeoPoint, Spot } from '@/src/types';
import { distanceMeters, formatDistance, isKnownLocation } from './geo';
import { getSpotDisplayName } from './spot-name';

/**
 * The existing spots a new one at `location` might really be (D25): known-location, not soft-deleted spots within
 * `radiusMeters` (inclusive), nearest first. An unknown `location` (NO_LOCATION) has no neighbours.
 */
export function nearbySpots(location: GeoPoint, spots: Spot[], radiusMeters: number): Spot[] {
  if (!isKnownLocation(location)) return [];
  return spots
    .filter((spot) => !spot.deleted_at && isKnownLocation(spot.location))
    .map((spot) => ({ spot, meters: distanceMeters(location, spot.location) }))
    .filter(({ meters }) => meters <= radiusMeters)
    .sort((a, b) => a.meters - b.meters)
    .map(({ spot }) => spot);
}

/** The offer's line for one nearby spot: 'Near Downtown Rail · 16 ft' (distance in the user's units). */
export function nearbyLabel(location: GeoPoint, spot: Spot, imperial: boolean): string {
  return `Near ${getSpotDisplayName(spot)} · ${formatDistance(distanceMeters(location, spot.location) / 1000, imperial)}`;
}
