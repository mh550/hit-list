import type { Region } from 'react-native-maps';
import { UnitSystem, type GeoPoint, type HitList, type Spot } from '@/src/types';
import { distanceMeters, isKnownLocation } from '@/src/utils/geo';

const METERS_PER_MILE = 1609.344;
const METERS_PER_KM = 1000;
const METERS_PER_DEGREE_LAT = 111_320;
const REGION_MARGIN = 1.3; // the circle's edge stays clear of the screen border
const MIN_COS_LAT = 0.01; // near the poles a degree of longitude shrinks to nothing
const MAX_LAT_DELTA = 180; // MKMapView throws 'Invalid Region' beyond these spans (as in map-region.ts)
const MAX_LNG_DELTA = 360;

/** The radius chips, in whole metres, per unit (D56). */
export const RADIUS_STEPS_M: Record<UnitSystem, readonly number[]> = {
  imperial: [402, 805, 1609, 3219, 8047, 16093, 40234], // 0.25, 0.5, 1, 2, 5, 10, 25 mi (Math.round(mi × 1609.344))
  metric: [500, 1000, 2000, 5000, 10000, 25000, 50000], // 0.5, 1, 2, 5, 10, 25, 50 km
};

/** An area list with its circle set: the only kind whose spots can be computed. */
export type AreaList = HitList & { kind: 'area'; area_center: GeoPoint; area_radius_m: number };

export function isAreaList(list: HitList | undefined): list is AreaList {
  return list?.kind === 'area' && list.area_center !== undefined && list.area_radius_m !== undefined;
}

/** 2 mi; metric riders get nearestStep(3219, metric) = 2000. */
export const DEFAULT_AREA_RADIUS_M = 3219;

/** Spots with a known location whose haversine distance to `center` is ≤ radiusM (the boundary counts), input order. */
export function spotsInCircle(spots: Spot[], center: GeoPoint, radiusM: number): Spot[] {
  return spots.filter((s) => isKnownLocation(s.location) && distanceMeters(center, s.location) <= radiusM);
}

/** The step of `units` closest to radiusM (ties go to the smaller one). */
export function nearestStep(radiusM: number, units: UnitSystem): number {
  return RADIUS_STEPS_M[units].reduce((best, step) =>
    Math.abs(step - radiusM) < Math.abs(best - radiusM) ? step : best,
  );
}

/** '0.25 mi', '2 mi', '3.2 km': below 1 unit two decimals, otherwise one, trailing zeros dropped. */
export function radiusLabel(radiusM: number, units: UnitSystem): string {
  const imperial = units === UnitSystem.Imperial;
  const value = radiusM / (imperial ? METERS_PER_MILE : METERS_PER_KM);
  const rounded = Number(value.toFixed(value < 1 ? 2 : 1));
  return `${rounded} ${imperial ? 'mi' : 'km'}`;
}

/** 'Area · 2 mi' / 'Area · 2 mi of Capitol Hill' (place trimmed; blank = none). */
export function areaLabel(radiusM: number, units: UnitSystem, place?: string): string {
  const label = `Area · ${radiusLabel(radiusM, units)}`;
  const trimmed = place?.trim();
  return trimmed ? `${label} of ${trimmed}` : label;
}

/** A camera region centred on `center` whose span holds the whole circle with a 1.3× margin. */
export function circleRegion(center: GeoPoint, radiusM: number): Region {
  const latitudeDelta = ((2 * radiusM) / METERS_PER_DEGREE_LAT) * REGION_MARGIN;
  const cosLat = Math.max(Math.cos((center.latitude * Math.PI) / 180), MIN_COS_LAT);
  return {
    latitude: center.latitude,
    longitude: center.longitude,
    latitudeDelta: Math.min(latitudeDelta, MAX_LAT_DELTA),
    longitudeDelta: Math.min(latitudeDelta / cosLat, MAX_LNG_DELTA),
  };
}

/** D54: the place still describes `center` when it is within a quarter of the radius of where the place put it. */
export function keepsPlace(placeCenter: GeoPoint, center: GeoPoint, radiusM: number): boolean {
  return distanceMeters(placeCenter, center) <= radiusM / 4;
}
