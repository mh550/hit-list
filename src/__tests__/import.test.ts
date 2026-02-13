import { groupPhotosByProximity, ImportPhoto } from '@/src/utils/import-clustering';

const makePhoto = (lat: number, lng: number, uri = `uri-${lat}-${lng}`): ImportPhoto => ({
  uri,
  location: { latitude: lat, longitude: lng },
  capturedAt: new Date().toISOString(),
});

describe('groupPhotosByProximity', () => {
  it('groups photos within radius into one cluster', () => {
    // Two photos ~10m apart (same street corner)
    const p1 = makePhoto(47.6062, -122.3321, 'a');
    const p2 = makePhoto(47.6063, -122.3322, 'b'); // ~13m away
    const groups = groupPhotosByProximity([p1, p2], 50);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });

  it('separates photos outside radius into different clusters', () => {
    const p1 = makePhoto(47.6062, -122.3321, 'a');
    const p2 = makePhoto(47.6500, -122.3321, 'b'); // ~4.9km away
    const groups = groupPhotosByProximity([p1, p2], 50);
    expect(groups).toHaveLength(2);
  });

  it('handles single photo', () => {
    const p1 = makePhoto(47.6062, -122.3321);
    const groups = groupPhotosByProximity([p1], 50);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(1);
  });

  it('returns empty array for empty input', () => {
    const groups = groupPhotosByProximity([], 50);
    expect(groups).toHaveLength(0);
  });

  it('groups photos without location into their own single-photo groups', () => {
    const p1 = makePhoto(47.6062, -122.3321, 'a');
    const p2: ImportPhoto = { uri: 'no-location', location: null, capturedAt: new Date().toISOString() };
    const groups = groupPhotosByProximity([p1, p2], 50);
    // p2 has no location — should be its own group
    expect(groups).toHaveLength(2);
  });

  it('uses radius correctly — 100m radius groups closer photos', () => {
    // Two photos ~80m apart
    const p1 = makePhoto(47.6062, -122.3321, 'a');
    const p2 = makePhoto(47.6069, -122.3321, 'b'); // ~78m
    const groupsSmall = groupPhotosByProximity([p1, p2], 50);
    const groupsLarge = groupPhotosByProximity([p1, p2], 100);
    expect(groupsSmall).toHaveLength(2);
    expect(groupsLarge).toHaveLength(1);
  });

  it('preserves order within a cluster (first photo first)', () => {
    const p1 = makePhoto(47.6062, -122.3321, 'first');
    const p2 = makePhoto(47.6063, -122.3321, 'second');
    const groups = groupPhotosByProximity([p1, p2], 50);
    expect(groups[0][0].uri).toBe('first');
  });
});
