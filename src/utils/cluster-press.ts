import type { GeoPoint } from '@/src/types';
import { haversineDistance } from '@/src/utils/geo';

/** Spots this close together count as one place (D8): zooming cannot pull their pins apart, so a cluster tap lists them. */
export const SAME_PLACE_METERS = 10;

/**
 * One leaf of a react-native-map-clustering cluster: a supercluster GeoJSON point whose properties are the original
 * Marker's props (so `identifier` is the spot id) and whose coordinates are [lng, lat].
 */
export interface ClusterLeaf {
  geometry: { coordinates: number[] };
  properties: { identifier?: string };
}

export interface ClusterPressTarget {
  ids: string[];
  coords: GeoPoint[];
  /** Every pair of leaves is within SAME_PLACE_METERS. */
  samePlace: boolean;
}

/** What a cluster tap should do: list the spots (samePlace) or zoom to `coords`. */
export function clusterPressTarget(leaves: readonly ClusterLeaf[]): ClusterPressTarget {
  const ids: string[] = [];
  const coords: GeoPoint[] = [];
  for (const { geometry, properties } of leaves) {
    if (properties.identifier) ids.push(properties.identifier);
    coords.push({ latitude: geometry.coordinates[1], longitude: geometry.coordinates[0] });
  }
  const samePlace = coords.every((a, i) =>
    coords.slice(i + 1).every((b) => haversineDistance(a, b) * 1000 <= SAME_PLACE_METERS),
  );
  return { ids, coords, samePlace };
}
