import type { Region } from 'react-native-maps';

/** Where the map opens with no spots and no location yet (Seattle). */
export const DEFAULT_REGION: Region = {
  latitude: 47.6062,
  longitude: -122.3321,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

/** About 1 km: never zoom tighter than a few blocks, even when every spot is at one point. */
export const MIN_DELTA = 0.01;

/** Span around the user's own position. */
export const CURRENT_LOCATION_DELTA = 0.05;
