import type { Media, Spot } from '@/src/types';

/** The spot's primary photo if it names a row, else its first photo. */
export function primaryPhoto(spot: Spot, media: Media[] | undefined): Media | undefined {
  return media?.find((m) => m.id === spot.primary_photo_id) ?? media?.[0];
}

/** A spot's photos in capture order, with the primary photo first. */
export function spotPhotos(spot: Spot, media: Media[] | undefined): Media[] {
  const primary = primaryPhoto(spot, media);
  return primary ? [primary, ...(media ?? []).filter((m) => m !== primary)] : [];
}
