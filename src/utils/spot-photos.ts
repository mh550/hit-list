import type { Media, Spot } from '@/src/types';

/** A spot's photos in capture order, with its primary photo (if it names a row) moved first. */
export function spotPhotos(spot: Spot, media: Media[] | undefined): Media[] {
  if (!media?.length) return [];
  const primary = media.find((m) => m.id === spot.primary_photo_id);
  return primary ? [primary, ...media.filter((m) => m !== primary)] : media;
}
