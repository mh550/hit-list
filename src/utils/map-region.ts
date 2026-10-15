import type { Region } from 'react-native-maps';
import { CURRENT_LOCATION_DELTA, DEFAULT_REGION, MIN_DELTA } from '@/src/constants/map';
import type { GeoPoint, Spot } from '@/src/types';

const PADDING = 1.4; // keep edge pins off the screen border
const MAX_LAT_DELTA = 180; // MKMapView throws 'Invalid Region' beyond these spans
const MAX_LNG_DELTA = 360;

/** Spots saved without a fix are stored at (0, 0); they are not a real place to show. */
export function hasKnownLocation(spot: Spot): boolean {
  return spot.location.latitude !== 0 || spot.location.longitude !== 0;
}

/** Shortest longitude arc covering every value: it starts right after the largest gap on the circle. */
function longitudeArc(lngs: number[]): { center: number; span: number } {
  const sorted = [...lngs].sort((a, b) => a - b);
  let gap = sorted[0] + 360 - sorted[sorted.length - 1]; // the gap across the antimeridian
  let start = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] > gap) {
      gap = sorted[i] - sorted[i - 1];
      start = sorted[i];
    }
  }
  const span = 360 - gap;
  const center = start + span / 2;
  return { center: center > 180 ? center - 360 : center, span };
}

/** The map's starting region: the user's location, else all located spots, else Seattle. */
export function initialRegion(spots: Spot[], current: GeoPoint | null): Region {
  if (current) {
    return { ...current, latitudeDelta: CURRENT_LOCATION_DELTA, longitudeDelta: CURRENT_LOCATION_DELTA };
  }
  const located = spots.filter(hasKnownLocation);
  if (located.length === 0) return DEFAULT_REGION;

  const lats = located.map((s) => s.location.latitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const lng = longitudeArc(located.map((s) => s.location.longitude));
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: lng.center,
    latitudeDelta: Math.min(Math.max((maxLat - minLat) * PADDING, MIN_DELTA), MAX_LAT_DELTA),
    longitudeDelta: Math.min(Math.max(lng.span * PADDING, MIN_DELTA), MAX_LNG_DELTA),
  };
}
