import { initialRegion } from '@/src/utils/map-region';
import { CURRENT_LOCATION_DELTA, DEFAULT_REGION, MIN_DELTA } from '@/src/constants/map';
import { createTestSpot } from './factories';

const at = (latitude: number, longitude: number) => createTestSpot({ location: { latitude, longitude } });

describe('initialRegion', () => {
  it('centres on the current location when known', () => {
    expect(initialRegion([createTestSpot()], { latitude: 40, longitude: -74 })).toEqual({
      latitude: 40,
      longitude: -74,
      latitudeDelta: CURRENT_LOCATION_DELTA,
      longitudeDelta: CURRENT_LOCATION_DELTA,
    });
  });

  it('fits all spots when the location is unknown', () => {
    const r = initialRegion([at(47.6, -122.34), at(47.7, -122.3)], null);

    expect(r.latitude).toBeCloseTo(47.65);
    expect(r.longitude).toBeCloseTo(-122.32);
    expect(r.latitudeDelta).toBeCloseTo(0.14);
    expect(r.longitudeDelta).toBeCloseTo(0.056);
  });

  it('never zooms below MIN_DELTA when every spot is at one point', () => {
    const r = initialRegion([at(47.6, -122.3), at(47.6, -122.3)], null);

    expect(r.latitudeDelta).toBe(MIN_DELTA);
    expect(r.longitudeDelta).toBe(MIN_DELTA);
  });

  it('contains spots far apart with positive deltas', () => {
    const r = initialRegion([at(47.6, -122.3), at(40.7, -74.0)], null);

    expect(r.latitudeDelta).toBeGreaterThan(47.6 - 40.7);
    expect(r.longitudeDelta).toBeGreaterThan(122.3 - 74.0);
  });

  const valid = (r: ReturnType<typeof initialRegion>) => {
    expect(r.latitudeDelta).toBeGreaterThan(0);
    expect(r.latitudeDelta).toBeLessThanOrEqual(180);
    expect(r.longitudeDelta).toBeGreaterThan(0);
    expect(r.longitudeDelta).toBeLessThanOrEqual(360);
    expect(Math.abs(r.longitude)).toBeLessThanOrEqual(180);
  };

  it('frames spots across the antimeridian the short way round', () => {
    const r = initialRegion([at(-17.7, 178.0), at(-13.8, -172.0)], null); // Fiji, Samoa

    valid(r);
    expect(r.longitudeDelta).toBeCloseTo(10 * 1.4);
    expect(Math.abs(r.longitude)).toBeCloseTo(177);
  });

  it('stays within MapKit limits for spots on opposite sides of the world', () => {
    valid(initialRegion([at(47.6, -122.3), at(35.7, 139.7)], null)); // Seattle, Tokyo
    valid(initialRegion([at(47.6, -122.3), at(-33.9, 151.2)], null)); // Seattle, Sydney
    valid(initialRegion([at(80, 0), at(-80, 90), at(0, 179), at(0, -91)], null));
  });

  it('ignores spots saved without a location (0, 0)', () => {
    const r = initialRegion([at(47.6, -122.34), at(47.7, -122.3), at(0, 0)], null);

    expect(r.latitude).toBeCloseTo(47.65);
    expect(r.longitude).toBeCloseTo(-122.32);
    expect(initialRegion([at(0, 0)], null)).toEqual(DEFAULT_REGION);
  });

  it('falls back to the Seattle default with no spots and no location', () => {
    expect(initialRegion([], null)).toEqual(DEFAULT_REGION);
  });
});
