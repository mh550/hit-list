import { nearbySpots } from '@/src/utils/nearby-spots';
import { distanceMeters, NO_LOCATION } from '@/src/utils/geo';
import type { GeoPoint } from '@/src/types';
import { CITIES, createTestSpot } from './factories';

const here = CITIES.seattle;
/** Metres per degree of latitude on the haversine sphere (R = 6371 km). */
const M_PER_DEG_LAT = (6371000 * Math.PI) / 180;

/** A point `meters` due north of `here`. */
function north(meters: number): GeoPoint {
  return { latitude: here.latitude + meters / M_PER_DEG_LAT, longitude: here.longitude };
}

describe('nearbySpots', () => {
  it('the north() helper places points at the stated distance', () => {
    expect(distanceMeters(here, north(40))).toBeCloseTo(40, 6);
  });

  it('returns the spots within the radius, nearest first', () => {
    const at40 = createTestSpot({ name: '40 m', location: north(40) });
    const at60 = createTestSpot({ name: '60 m', location: north(60) });
    const at10 = createTestSpot({ name: '10 m', location: north(10) });

    expect(nearbySpots(here, [at40, at60, at10], 50).map((s) => s.name)).toEqual(['10 m', '40 m']);
  });

  it('never returns a spot without a location', () => {
    const unknown = createTestSpot({ location: NO_LOCATION });
    // A radius big enough to reach (0, 0) from Seattle: excluded by isKnownLocation, not by distance.
    expect(nearbySpots(here, [unknown], 20_000_000)).toEqual([]);
  });

  it('never returns a soft-deleted spot', () => {
    const deleted = createTestSpot({ location: north(5), deleted_at: new Date().toISOString() });
    expect(nearbySpots(here, [deleted], 50)).toEqual([]);
  });

  it('returns [] when the query location is unknown', () => {
    const atOrigin = createTestSpot({ location: { latitude: 0, longitude: 0.0001 } });
    expect(nearbySpots(NO_LOCATION, [atOrigin], 50)).toEqual([]);
  });

  it('includes a spot at exactly the radius', () => {
    const edge = createTestSpot({ location: north(30) });
    const radius = distanceMeters(here, edge.location);
    expect(nearbySpots(here, [edge], radius)).toEqual([edge]);
  });

  it('does not mutate the input array', () => {
    const far = createTestSpot({ location: north(40) });
    const near = createTestSpot({ location: north(10) });
    const spots = [far, near];
    nearbySpots(here, spots, 50);
    expect(spots).toEqual([far, near]);
  });
});
