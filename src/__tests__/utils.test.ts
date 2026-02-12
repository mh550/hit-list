import { haversineDistance, formatDistance } from '@/src/utils/geo';
import { displayLength, inputToMeters, metersToDisplay } from '@/src/utils/units';
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
});

describe('getSpotDisplayName', () => {
  it('returns user name when set', () => {
    const spot = createTestSpot({ name: 'Downtown Rail' });
    expect(getSpotDisplayName(spot)).toBe('Downtown Rail');
  });

  it('falls back to generated_name', () => {
    const spot = createTestSpot({ generated_name: 'NE 45th & University Way' });
    expect(getSpotDisplayName(spot)).toBe('NE 45th & University Way');
  });

  it('falls back to Untitled Spot with date', () => {
    const spot = createTestSpot({ created_at: '2025-02-07T12:00:00Z' });
    const name = getSpotDisplayName(spot);
    expect(name).toMatch(/^Untitled Spot — /);
    expect(name).toContain('Feb');
  });

  it('prefers name over generated_name', () => {
    const spot = createTestSpot({
      name: 'My Spot',
      generated_name: 'Some Address',
    });
    expect(getSpotDisplayName(spot)).toBe('My Spot');
  });
});
