import { distanceMeters, haversineDistance, formatDistance } from '@/src/utils/geo';
import {
  displayLength,
  inputToMeters,
  metersToDisplay,
  dimensionFromInput,
  initialDimText,
} from '@/src/utils/units';
import { getSpotDisplayName } from '@/src/utils/spot-name';
import { UnitSystem } from '@/src/types';
import { createTestSpot } from './factories';

describe('haversineDistance', () => {
  it('returns 0 for same point', () => {
    const p = { latitude: 47.6062, longitude: -122.3321 };
    expect(haversineDistance(p, p)).toBeCloseTo(0, 5);
  });

  it('calculates known distance (Seattle to Portland ~234km)', () => {
    const seattle = { latitude: 47.6062, longitude: -122.3321 };
    const portland = { latitude: 45.5152, longitude: -122.6784 };
    const dist = haversineDistance(seattle, portland);
    expect(dist).toBeGreaterThan(230);
    expect(dist).toBeLessThan(240);
  });
});

describe('distanceMeters', () => {
  it('is haversineDistance in metres (0.00021 deg of latitude ~23 m)', () => {
    const a = { latitude: 47.6062, longitude: -122.3321 };
    const b = { latitude: 47.60641, longitude: -122.3321 };
    expect(distanceMeters(a, b)).toBeCloseTo(haversineDistance(a, b) * 1000, 6);
    expect(distanceMeters(a, b)).toBeGreaterThan(23);
    expect(distanceMeters(a, b)).toBeLessThan(24);
  });
});

describe('formatDistance', () => {
  it('formats metric short distance', () => {
    expect(formatDistance(0.5, false)).toBe('500 m');
  });

  it('formats metric long distance', () => {
    expect(formatDistance(5.3, false)).toBe('5.3 km');
  });

  it('formats imperial short distance', () => {
    const result = formatDistance(0.01, true);
    expect(result).toMatch(/\d+ ft/);
  });

  it('formats imperial long distance', () => {
    const result = formatDistance(5, true);
    expect(result).toMatch(/\d+\.\d mi/);
  });
});

describe('units', () => {
  it('displays length in feet for imperial', () => {
    expect(displayLength(1, UnitSystem.Imperial)).toBe('3.3 ft');
  });

  it('displays length in meters for metric', () => {
    expect(displayLength(1, UnitSystem.Metric)).toBe('1.0 m');
  });

  it('converts feet input to meters', () => {
    expect(inputToMeters(3.28084, UnitSystem.Imperial)).toBeCloseTo(1, 3);
  });

  it('passes through meters for metric input', () => {
    expect(inputToMeters(5, UnitSystem.Metric)).toBe(5);
  });

  it('converts meters to display feet', () => {
    expect(metersToDisplay(1, UnitSystem.Imperial)).toBeCloseTo(3.28084, 3);
  });

  it('dimensionFromInput keeps the stored value exactly when the text is unchanged', () => {
    // Guard: an untouched field must not round-trip through its one-decimal display text.
    const initial = initialDimText(1.234, UnitSystem.Metric);
    expect(dimensionFromInput(initial, initial, 1.234, UnitSystem.Metric)).toBe(1.234);
  });

  it('dimensionFromInput returns undefined for empty text', () => {
    // Guard: clearing a field means "no dimension".
    expect(dimensionFromInput('', '1.2', 1.234, UnitSystem.Metric)).toBeUndefined();
  });

  it('dimensionFromInput reads a comma decimal', () => {
    // Guard: decimal pads in many locales type "1,5".
    expect(dimensionFromInput('1,5', '', undefined, UnitSystem.Metric)).toBe(1.5);
  });

  it('dimensionFromInput returns undefined for junk text when nothing is stored', () => {
    // Guard: invalid text on an empty field must not become NaN.
    expect(dimensionFromInput('abc', '', undefined, UnitSystem.Metric)).toBeUndefined();
  });

  it.each(['0', '0.0', '0,0', '.0'])(
    'dimensionFromInput returns undefined when zero (%s) is typed over a stored value',
    (text) => {
      // The placeholder is "0", so typing 0 means "none"; it must clear the dimension, not silently keep the old one.
      expect(dimensionFromInput(text, '1.2', 1.234, UnitSystem.Metric)).toBeUndefined();
    },
  );

  it.each(['-2', 'abc'])('dimensionFromInput keeps the stored value for invalid text %s', (text) => {
    // Guard: negatives and junk are not valid sizes and leave the stored value alone.
    expect(dimensionFromInput(text, '1.2', 1.234, UnitSystem.Metric)).toBe(1.234);
  });
});

describe('getSpotDisplayName', () => {
  it('returns user name when set', () => {
    const spot = createTestSpot({ name: 'Downtown Rail' });
    expect(getSpotDisplayName(spot)).toBe('Downtown Rail');
  });

  it('shows the generated town inside the untitled label', () => {
    const spot = createTestSpot({ generated_name: 'Seattle', created_at: '2025-02-07T12:00:00Z' });
    expect(getSpotDisplayName(spot)).toBe('Untitled · Seattle · Feb 7, 12:00 PM');
  });

  it('falls back to Untitled with date and time', () => {
    const spot = createTestSpot({ created_at: '2025-02-07T12:00:00Z' });
    expect(getSpotDisplayName(spot)).toBe('Untitled · Feb 7, 12:00 PM');
  });

  it('prefers name over generated_name', () => {
    const spot = createTestSpot({
      name: 'My Spot',
      generated_name: 'Some Address',
    });
    expect(getSpotDisplayName(spot)).toBe('My Spot');
  });
});
