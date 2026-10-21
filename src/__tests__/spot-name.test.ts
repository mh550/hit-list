import { getSpotDisplayName, formatSpotTime, featureTypesLabel } from '@/src/utils/spot-name';
import { FeatureType } from '@/src/types';
import type { Spot } from '@/src/types';
import { createTestSpot } from './factories';

// Jest runs with TZ=UTC (jest.global-setup.js), so local time here equals UTC.
const name = (o: Partial<Spot>) => getSpotDisplayName(createTestSpot(o));

describe('getSpotDisplayName (D4)', () => {
  it('uses the name when set, even with a town', () => {
    expect(name({ name: 'Pier 57', generated_name: 'Seattle' })).toBe('Pier 57');
  });

  it('shows town and time for an untitled spot with a town', () => {
    expect(name({ generated_name: 'Seattle', created_at: '2026-10-13T14:22:00.000Z' })).toBe(
      'Untitled · Seattle · Oct 13, 2:22 PM',
    );
  });

  it('shows only the time without a town', () => {
    expect(name({ created_at: '2026-10-13T14:22:00.000Z' })).toBe('Untitled · Oct 13, 2:22 PM');
  });

  it('shows an EXIF-derived local time as wall-clock time', () => {
    expect(name({ created_at: '2026-10-13T14:22:01' })).toBe('Untitled · Oct 13, 2:22 PM');
  });

  it('never shows "Invalid Date"', () => {
    expect(name({ created_at: 'nope' })).toBe('Untitled');
  });
});

describe('formatSpotTime', () => {
  it.each([
    ['2026-10-13T00:05:00.000Z', 'Oct 13, 12:05 AM'],
    ['2026-10-13T12:05:00.000Z', 'Oct 13, 12:05 PM'],
    ['2026-01-02T09:30:00.000Z', 'Jan 2, 9:30 AM'],
    ['2026-12-31T23:59:00.000Z', 'Dec 31, 11:59 PM'],
  ])('formats %s as %s', (iso, out) => {
    expect(formatSpotTime(iso)).toBe(out);
  });

  it('returns an empty string for an invalid date', () => {
    expect(formatSpotTime('nope')).toBe('');
  });
});

describe('featureTypesLabel', () => {
  const label = (feature_types: FeatureType[]) => featureTypesLabel(createTestSpot({ feature_types }));

  it('shows a single type by its label', () => {
    expect(label([FeatureType.Rail])).toBe('Rail');
  });

  it('shows the first type and +N for the rest', () => {
    expect(label([FeatureType.Rail, FeatureType.Ledge])).toBe('Rail +1');
    expect(label([FeatureType.StairSet, FeatureType.Rail, FeatureType.Gap])).toBe('Stair set +2');
  });

  it('is undefined for an untagged spot', () => {
    expect(label([])).toBeUndefined();
  });
});
