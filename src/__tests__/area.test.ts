import {
  isAreaList,
  RADIUS_STEPS_M,
  DEFAULT_AREA_RADIUS_M,
  spotsInCircle,
  nearestStep,
  radiusLabel,
  areaLabel,
  circleRegion,
  keepsPlace,
} from '@/src/utils/area';
import { NO_LOCATION, distanceMeters } from '@/src/utils/geo';
import { UnitSystem, type GeoPoint } from '@/src/types';
import { CITIES, createTestHitList, createTestSpot } from './factories';

const { Imperial, Metric } = UnitSystem;

/** A point `meters` due north of `p` (haversine's Earth: 6371 km). */
const north = (p: GeoPoint, meters: number): GeoPoint => ({
  latitude: p.latitude + (meters / 6_371_000) * (180 / Math.PI),
  longitude: p.longitude,
});

describe('RADIUS_STEPS_M', () => {
  it('holds the imperial and metric chips in whole metres', () => {
    expect(RADIUS_STEPS_M.imperial).toEqual([402, 805, 1609, 3219, 8047, 16093, 40234]);
    expect(RADIUS_STEPS_M.metric).toEqual([500, 1000, 2000, 5000, 10000, 25000, 50000]);
    expect(DEFAULT_AREA_RADIUS_M).toBe(3219);
  });
});

describe('spotsInCircle', () => {
  const center = CITIES.seattle;
  const edge = createTestSpot({ id: 'edge', location: { latitude: 47.62, longitude: -122.35 } });
  const r = distanceMeters(center, edge.location);

  it('keeps a spot exactly on the boundary and drops it once the radius is 1 m short', () => {
    expect(spotsInCircle([edge], center, r)).toEqual([edge]);
    expect(spotsInCircle([edge], center, r - 1)).toEqual([]);
  });

  it('drops a spot 1 m outside the circle', () => {
    const outside = createTestSpot({ id: 'out', location: north(center, 1001) });
    const inside = createTestSpot({ id: 'in', location: north(center, 999) });
    expect(spotsInCircle([outside, inside], center, 1000).map((s) => s.id)).toEqual(['in']);
  });

  it('never returns a NO_LOCATION spot, even for a circle around (0, 0)', () => {
    const nowhere = createTestSpot({ id: 'nowhere', location: NO_LOCATION });
    expect(spotsInCircle([nowhere], NO_LOCATION, 50_000)).toEqual([]);
    expect(spotsInCircle([nowhere], center, 50_000)).toEqual([]);
  });

  it('keeps the input order', () => {
    const a = createTestSpot({ id: 'a', location: north(center, 300) });
    const b = createTestSpot({ id: 'b', location: north(center, 100) });
    const c = createTestSpot({ id: 'c', location: north(center, 200) });
    expect(spotsInCircle([a, b, c], center, 500).map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('nearestStep', () => {
  it('returns the closest step of the unit', () => {
    expect(nearestStep(1700, Imperial)).toBe(1609);
    expect(nearestStep(3219, Metric)).toBe(2000);
    expect(nearestStep(3219, Imperial)).toBe(3219);
    expect(nearestStep(1, Imperial)).toBe(402);
    expect(nearestStep(1_000_000, Metric)).toBe(50000);
  });

  it('breaks a tie towards the smaller step', () => {
    expect(nearestStep(1500, Metric)).toBe(1000);
  });
});

describe('radiusLabel', () => {
  it('labels every chip of both units', () => {
    expect(RADIUS_STEPS_M.imperial.map((m) => radiusLabel(m, Imperial))).toEqual([
      '0.25 mi',
      '0.5 mi',
      '1 mi',
      '2 mi',
      '5 mi',
      '10 mi',
      '25 mi',
    ]);
    expect(RADIUS_STEPS_M.metric.map((m) => radiusLabel(m, Metric))).toEqual([
      '0.5 km',
      '1 km',
      '2 km',
      '5 km',
      '10 km',
      '25 km',
      '50 km',
    ]);
  });

  it('converts a radius saved in the other unit (D56)', () => {
    expect(radiusLabel(3219, Metric)).toBe('3.2 km');
    expect(radiusLabel(2000, Imperial)).toBe('1.2 mi');
  });
});

describe('areaLabel', () => {
  it('reads Area · <radius> [of <place>]', () => {
    expect(areaLabel(3219, Imperial)).toBe('Area · 2 mi');
    expect(areaLabel(2000, Metric, 'Capitol Hill')).toBe('Area · 2 km of Capitol Hill');
    expect(areaLabel(402, Imperial)).toBe('Area · 0.25 mi');
  });

  it('trims the place and ignores a blank one', () => {
    expect(areaLabel(3219, Imperial, '  Capitol Hill ')).toBe('Area · 2 mi of Capitol Hill');
    expect(areaLabel(3219, Imperial, '   ')).toBe('Area · 2 mi');
    expect(areaLabel(3219, Imperial, '')).toBe('Area · 2 mi');
  });
});

describe('circleRegion', () => {
  it('centres on the circle and holds it with a margin (1 mi at 47.6°)', () => {
    const center = { latitude: 47.6, longitude: -122.3 };
    const region = circleRegion(center, 1609);
    expect(region.latitude).toBe(47.6);
    expect(region.longitude).toBe(-122.3);

    const circleLatSpan = (2 * 1609) / 111_320; // ≈ 0.0289°
    expect(region.latitudeDelta).toBeGreaterThanOrEqual(circleLatSpan * 1.2);
    expect(region.longitudeDelta).toBeGreaterThanOrEqual(region.latitudeDelta / Math.cos((47.6 * Math.PI) / 180));
    // The circle's north and east edges are inside the region's half-spans.
    expect(region.latitudeDelta / 2).toBeGreaterThan(north(center, 1609).latitude - 47.6);
    const eastEdgeDeg = (1609 / (6_371_000 * Math.cos((47.6 * Math.PI) / 180))) * (180 / Math.PI);
    expect(region.longitudeDelta / 2).toBeGreaterThan(eastEdgeDeg);
  });

  it('stays inside the spans MKMapView accepts', () => {
    const polar = circleRegion({ latitude: 89.99, longitude: 0 }, 50_000);
    expect(polar.latitudeDelta).toBeLessThanOrEqual(180);
    expect(polar.longitudeDelta).toBeLessThanOrEqual(360);
    expect(circleRegion(CITIES.seattle, 1e9).latitudeDelta).toBe(180);
  });
});

describe('keepsPlace (D54)', () => {
  const place = CITIES.seattle;
  it('keeps the place within a quarter of the radius and drops it beyond', () => {
    expect(keepsPlace(place, place, 3219)).toBe(true);
    expect(keepsPlace(place, north(place, 0.2 * 3219), 3219)).toBe(true);
    expect(keepsPlace(place, north(place, 0.3 * 3219), 3219)).toBe(false);
  });
});

describe('isAreaList', () => {
  it('is true only for an area list with its centre and radius set', () => {
    expect(isAreaList(createTestHitList({ kind: 'area', area_center: CITIES.seattle, area_radius_m: 3219 }))).toBe(true);
    expect(isAreaList(createTestHitList({ kind: 'area', area_center: CITIES.seattle }))).toBe(false);
    expect(isAreaList(createTestHitList({ kind: 'area', area_radius_m: 3219 }))).toBe(false);
    expect(isAreaList(createTestHitList({ kind: 'manual', area_center: CITIES.seattle, area_radius_m: 3219 }))).toBe(false);
    expect(isAreaList(undefined)).toBe(false);
  });
});
