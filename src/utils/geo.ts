import type { LocationObject } from 'expo-location';
import type { GeoPoint } from '@/src/types';

/**
 * Spots saved without a GPS fix are stored at (0, 0) (location is NOT NULL in the schema). Write
 * NO_LOCATION, test with isKnownLocation, so a later nullable-location migration has one symbol.
 */
export const NO_LOCATION: GeoPoint = { latitude: 0, longitude: 0 };

export function isKnownLocation(p: GeoPoint): boolean {
  return p.latitude !== 0 || p.longitude !== 0;
}

/** expo-location's position object → the app's GeoPoint. */
export function toGeoPoint({ coords }: LocationObject): GeoPoint {
  return { latitude: coords.latitude, longitude: coords.longitude };
}

const EARTH_RADIUS_KM = 6371;
const KM_TO_MILES = 0.621371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Haversine distance between two geo points.
 * Returns distance in kilometers.
 */
export function haversineDistance(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** haversineDistance in metres. */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  return haversineDistance(a, b) * 1000;
}

export function kmToMiles(km: number): number {
  return km * KM_TO_MILES;
}

export function metersToFeet(meters: number): number {
  return meters * 3.28084;
}

export function feetToMeters(feet: number): number {
  return feet / 3.28084;
}

export function formatDistance(km: number, imperial: boolean): string {
  if (imperial) {
    const miles = kmToMiles(km);
    if (miles < 0.1) {
      return `${Math.round(miles * 5280)} ft`;
    }
    return `${miles.toFixed(1)} mi`;
  }
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(1)} km`;
}
