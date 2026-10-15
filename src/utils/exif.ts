import type { GeoPoint } from '@/src/types';
import type { ImportPhoto } from '@/src/utils/import-clustering';

type Exif = Record<string, unknown> | null | undefined;

const EXIF_DATE = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

/** EXIF `YYYY:MM:DD HH:MM:SS` → ISO local time `YYYY-MM-DDTHH:MM:SS` (no zone); anything else → undefined. */
export function parseExifDate(raw: unknown): string | undefined {
  const m = typeof raw === 'string' ? raw.match(EXIF_DATE) : null;
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m;
  const ok = +mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31 && +h <= 23 && +mi <= 59 && +s <= 59;
  return ok ? `${y}-${mo}-${d}T${h}:${mi}:${s}` : undefined;
}

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/** Applies GPSLatitudeRef / GPSLongitudeRef (S, W) only to unsigned values; iOS may report either form. */
export function exifGps(exif: Exif): GeoPoint | null {
  const lat = num(exif?.GPSLatitude);
  const lng = num(exif?.GPSLongitude);
  if (lat === undefined || lng === undefined) return null;
  const sign = (v: number, ref: unknown, negative: string) => (ref === negative && v > 0 ? -v : v);
  return { latitude: sign(lat, exif?.GPSLatitudeRef, 'S'), longitude: sign(lng, exif?.GPSLongitudeRef, 'W') };
}

/** One picked library asset → an ImportPhoto: capture time (DateTimeOriginal, DateTime, else now) and signed GPS. */
export function importPhotoFromAsset(asset: { uri: string; exif?: Exif }, nowIso: string): ImportPhoto {
  return {
    uri: asset.uri,
    location: exifGps(asset.exif),
    capturedAt: parseExifDate(asset.exif?.DateTimeOriginal) ?? parseExifDate(asset.exif?.DateTime) ?? nowIso,
  };
}
