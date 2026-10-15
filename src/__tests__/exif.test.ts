import { parseExifDate, exifGps, importPhotoFromAsset } from '@/src/utils/exif';

describe('parseExifDate', () => {
  it('turns EXIF colons into an ISO local time', () => {
    expect(parseExifDate('2026:10:13 14:22:01')).toBe('2026-10-13T14:22:01');
  });

  it.each([undefined, null, '', 'garbage', '2026:13:45 99:99:99', 42])('rejects %p', (v) => {
    expect(parseExifDate(v)).toBeUndefined();
  });
});

describe('exifGps', () => {
  it('applies S and W refs to positive values', () => {
    expect(
      exifGps({ GPSLatitude: 47.6, GPSLatitudeRef: 'N', GPSLongitude: 122.3, GPSLongitudeRef: 'W' }),
    ).toEqual({ latitude: 47.6, longitude: -122.3 });
    expect(
      exifGps({ GPSLatitude: 33.9, GPSLatitudeRef: 'S', GPSLongitude: 151.2, GPSLongitudeRef: 'E' }),
    ).toEqual({ latitude: -33.9, longitude: 151.2 });
  });

  it('keeps already-signed values when the ref is missing or the value is negative', () => {
    expect(exifGps({ GPSLatitude: 47.6, GPSLongitude: -122.3 })).toEqual({ latitude: 47.6, longitude: -122.3 });
    expect(exifGps({ GPSLatitude: 47.6, GPSLongitude: -122.3, GPSLongitudeRef: 'W' })).toEqual({
      latitude: 47.6,
      longitude: -122.3,
    });
  });

  it('returns null without both coordinates', () => {
    expect(exifGps({ GPSLatitude: 47.6 })).toBeNull();
    expect(exifGps({ GPSLatitude: '47.6', GPSLongitude: '-122.3' })).toBeNull();
    expect(exifGps(undefined)).toBeNull();
  });
});

describe('importPhotoFromAsset', () => {
  const now = '2026-10-15T01:00:00.000Z';

  it('prefers DateTimeOriginal, then DateTime, then now', () => {
    expect(
      importPhotoFromAsset(
        { uri: 'u', exif: { DateTimeOriginal: '2026:10:13 14:22:01', DateTime: '2026:10:14 09:00:00' } },
        now,
      ).capturedAt,
    ).toBe('2026-10-13T14:22:01');
    expect(importPhotoFromAsset({ uri: 'u', exif: { DateTime: '2026:10:14 09:00:00' } }, now).capturedAt).toBe(
      '2026-10-14T09:00:00',
    );
    expect(importPhotoFromAsset({ uri: 'u', exif: { DateTime: 'garbage' } }, now).capturedAt).toBe(now);
  });

  it('imports a photo with no EXIF at all, dated now, with no location', () => {
    expect(importPhotoFromAsset({ uri: 'u', exif: null }, now)).toEqual({ uri: 'u', location: null, capturedAt: now });
  });

  it('carries the signed GPS position', () => {
    const p = importPhotoFromAsset(
      { uri: 'u', exif: { GPSLatitude: 47.6, GPSLatitudeRef: 'N', GPSLongitude: 122.3, GPSLongitudeRef: 'W' } },
      now,
    );
    expect(p.location).toEqual({ latitude: 47.6, longitude: -122.3 });
  });
});
