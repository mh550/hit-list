import { haversineDistance } from './geo';
import type { GeoPoint } from '@/src/types';

export interface ImportPhoto {
  uri: string;
  location: GeoPoint | null;
  capturedAt: string;
}

/**
 * Groups photos by geographic proximity using a greedy single-linkage algorithm.
 * Photos with no location are placed in their own single-photo group.
 *
 * @param photos - Array of photos to group
 * @param radiusMeters - Max distance (meters) to include a photo in an existing cluster
 */
export function groupPhotosByProximity(
  photos: ImportPhoto[],
  radiusMeters: number,
): ImportPhoto[][] {
  if (photos.length === 0) return [];

  const radiusKm = radiusMeters / 1000;
  const groups: ImportPhoto[][] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < photos.length; i++) {
    if (assigned.has(i)) continue;

    const photo = photos[i];

    // Photos without location get their own group
    if (!photo.location) {
      groups.push([photo]);
      assigned.add(i);
      continue;
    }

    // Start a new group with this photo as the seed
    const group: ImportPhoto[] = [photo];
    assigned.add(i);

    // Find all unassigned photos within radius of ANY photo in this group
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (let j = i + 1; j < photos.length; j++) {
        if (assigned.has(j)) continue;
        const candidate = photos[j];
        if (!candidate.location) continue;

        // Check if candidate is within radius of any photo in the group
        const withinRadius = group.some(
          (p) =>
            p.location &&
            haversineDistance(p.location, candidate.location!) <= radiusKm,
        );

        if (withinRadius) {
          group.push(candidate);
          assigned.add(j);
          expanded = true;
        }
      }
    }

    groups.push(group);
  }

  return groups;
}
