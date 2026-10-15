import type { Region } from 'react-native-maps';
import { CURRENT_LOCATION_DELTA, DEFAULT_REGION, MIN_DELTA } from '@/src/constants/map';
import type { GeoPoint, Spot } from '@/src/types';

const PADDING = 1.4; // keep edge pins off the screen border

/** The map's starting region: the user's location, else all spots, else Seattle. */
export function initialRegion(spots: Spot[], current: GeoPoint | null): Region {
  if (current) {
    return { ...current, latitudeDelta: CURRENT_LOCATION_DELTA, longitudeDelta: CURRENT_LOCATION_DELTA };
  }
  if (spots.length === 0) return DEFAULT_REGION;

  const lats = spots.map((s) => s.location.latitude);
  const lngs = spots.map((s) => s.location.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * PADDING, MIN_DELTA),
    longitudeDelta: Math.max((maxLng - minLng) * PADDING, MIN_DELTA),
  };
}
