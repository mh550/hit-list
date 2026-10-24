import {
  freezeSend,
  MAX_SEND_SPOTS,
  parseSendPayload,
  SEND_PAYLOAD_VERSION,
  thawSend,
  type SendPayload,
} from '@/src/utils/send-payload';
import { NO_LOCATION } from '@/src/utils/geo';
import { FeatureType, type Media, type Spot } from '@/src/types';
import { CITIES, createTestMedia, createTestSpot } from './factories';

const SEND_ID = '11111111-1111-4111-8111-111111111111';
const SENDER = { username: 'ana', display_name: 'Ana B' };
const NOW = '2026-10-23T12:00:00.000Z';
const UID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** Deterministic uuids: new-0001…, in the order thawSend asks for them. */
function counterIds() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
}

/** A spot with every field set, two photos (the second one primary) and the fields a payload must never carry. */
function fullSpot(): { spot: Spot; media: Media[] } {
  const spot = createTestSpot({
    name: 'Pier 57',
    generated_name: 'Belltown',
    location: CITIES.seattle,
    feature_types: [FeatureType.Ledge, FeatureType.Rail],
    stopped: true,
    natural_speed: 0,
    notes: 'under the bridge',
    owner_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-02-01T00:00:00.000Z',
  });
  const first = createTestMedia({ spot_id: spot.id, captured_at: '2026-10-13T14:22:05.000Z' });
  const second = createTestMedia({ spot_id: spot.id, captured_at: '2026-10-14T09:00:00' });
  spot.primary_photo_id = second.id;
  return { spot, media: [first, second] };
}

const SPOT_KEYS = [
  'id',
  'name',
  'generated_name',
  'lat',
  'lng',
  'feature_types',
  'stopped',
  'natural_speed',
  'notes',
  'photos',
];

describe('freezeSend', () => {
  it('freezes version 1 with the sender and one entry per spot carrying only the shareable fields', () => {
    const { spot, media } = fullSpot();

    const payload = freezeSend({ sendId: SEND_ID, sender: SENDER, spots: [spot], mediaBySpot: { [spot.id]: media } });

    expect(payload.v).toBe(SEND_PAYLOAD_VERSION);
    expect(SEND_PAYLOAD_VERSION).toBe(1);
    expect(Object.keys(payload)).toEqual(['v', 'sender', 'spots']);
    expect(payload.sender).toEqual({ username: 'ana', display_name: 'Ana B' });
    expect(payload.spots).toHaveLength(1);
    expect(Object.keys(payload.spots[0])).toEqual(SPOT_KEYS);
    expect(payload.spots[0]).toEqual({
      id: spot.id,
      name: 'Pier 57',
      generated_name: 'Belltown',
      lat: CITIES.seattle.latitude,
      lng: CITIES.seattle.longitude,
      feature_types: ['ledge', 'rail'],
      stopped: true,
      natural_speed: 0,
      notes: 'under the bridge',
      photos: [
        // primary first, then the rest; captured_at keeps the day only (D46)
        { media_id: media[1].id, path: `sends/${SEND_ID}/${media[1].id}.jpg`, captured_at: '2026-10-14' },
        { media_id: media[0].id, path: `sends/${SEND_ID}/${media[0].id}.jpg`, captured_at: '2026-10-13' },
      ],
    });
  });

  it('never carries an owner, a timestamp, a file path or the legacy archive', () => {
    const { spot, media } = fullSpot();
    const legacy = { ...spot, legacy_json: '{"old":1}' } as Spot;

    const json = JSON.stringify(
      freezeSend({ sendId: SEND_ID, sender: SENDER, spots: [legacy], mediaBySpot: { [spot.id]: media } }),
    );

    for (const banned of ['owner_id', 'updated_at', 'created_at', 'deleted_at', 'legacy', 'file_path', 'primary_photo_id', spot.owner_id!]) {
      expect(json).not.toContain(banned);
    }
    expect(Object.keys(JSON.parse(json).spots[0].photos[0])).toEqual(['media_id', 'path', 'captured_at']);
  });

  it('freezes unset fields as null, keeps 0 = None, and a spot without photos has none', () => {
    const bare = createTestSpot({ natural_speed: undefined });

    const [frozen] = freezeSend({ sendId: SEND_ID, sender: SENDER, spots: [bare], mediaBySpot: {} }).spots;

    expect(frozen).toMatchObject({ name: null, generated_name: null, natural_speed: null, notes: null, photos: [] });
    expect(frozen.feature_types).toEqual([]);
    expect(frozen.stopped).toBe(false);
  });

  it('a photo without a capture time freezes captured_at as null', () => {
    const spot = createTestSpot();
    const photo = createTestMedia({ spot_id: spot.id });

    const [frozen] = freezeSend({ sendId: SEND_ID, sender: SENDER, spots: [spot], mediaBySpot: { [spot.id]: [photo] } }).spots;

    expect(frozen.photos).toEqual([{ media_id: photo.id, path: `sends/${SEND_ID}/${photo.id}.jpg`, captured_at: null }]);
  });

  it('a spot at NO_LOCATION freezes with lat/lng 0', () => {
    const spot = createTestSpot({ location: NO_LOCATION });

    const [frozen] = freezeSend({ sendId: SEND_ID, sender: SENDER, spots: [spot], mediaBySpot: {} }).spots;

    expect(frozen.lat).toBe(0);
    expect(frozen.lng).toBe(0);
  });
});

describe('thawSend', () => {
  const frozenFull = () => {
    const { spot, media } = fullSpot();
    return {
      spot,
      media,
      payload: freezeSend({ sendId: SEND_ID, sender: SENDER, spots: [spot], mediaBySpot: { [spot.id]: media } }),
    };
  };

  it('returns owned spots with fresh ids marked From @sender, media drafts remapped to them and the downloads', () => {
    const { spot, media, payload } = frozenFull();

    const { spots, media: drafts, downloads } = thawSend(payload, { sendId: SEND_ID, uid: UID, now: NOW, newId: counterIds() });

    expect(spots).toHaveLength(1);
    const [copy] = spots;
    expect(copy.id).not.toBe(spot.id);
    expect(copy).toEqual({
      id: copy.id,
      name: 'Pier 57',
      generated_name: 'Belltown',
      location: CITIES.seattle,
      created_at: NOW,
      updated_at: NOW,
      feature_types: [FeatureType.Ledge, FeatureType.Rail],
      stopped: true,
      natural_speed: 0,
      notes: 'under the bridge',
      primary_photo_id: drafts[0].id,
      owner_id: UID,
      copied_from_send: SEND_ID,
      from_username: 'ana',
    });

    expect(drafts).toHaveLength(2);
    expect(new Set([copy.id, ...drafts.map((m) => m.id)]).size).toBe(3);
    for (const m of drafts) expect(media.map((o) => o.id)).not.toContain(m.id);
    expect(drafts[0]).toEqual({
      id: drafts[0].id,
      spot_id: copy.id,
      file_path: `photos/${copy.id}/${drafts[0].id}.jpg`,
      captured_at: '2026-10-14',
      location: CITIES.seattle,
      created_at: NOW,
      owner_id: UID,
    });
    expect(drafts[1]).toMatchObject({ spot_id: copy.id, captured_at: '2026-10-13' });

    expect(downloads).toEqual([
      {
        path: `sends/${SEND_ID}/${media[1].id}.jpg`,
        localRelativePath: `photos/${copy.id}/${drafts[0].id}.jpg`,
        mediaId: drafts[0].id,
        spotId: copy.id,
      },
      {
        path: `sends/${SEND_ID}/${media[0].id}.jpg`,
        localRelativePath: `photos/${copy.id}/${drafts[1].id}.jpg`,
        mediaId: drafts[1].id,
        spotId: copy.id,
      },
    ]);
  });

  it('a spot at NO_LOCATION thaws back to NO_LOCATION and its photos carry no location', () => {
    const spot = createTestSpot({ location: NO_LOCATION });
    const photo = createTestMedia({ spot_id: spot.id });
    const payload = freezeSend({ sendId: SEND_ID, sender: SENDER, spots: [spot], mediaBySpot: { [spot.id]: [photo] } });

    const { spots, media } = thawSend(payload, { sendId: SEND_ID, uid: UID, now: NOW, newId: counterIds() });

    expect(spots[0].location).toEqual(NO_LOCATION);
    expect(media[0].location).toBeUndefined();
  });

  it('a spot without photos thaws with no primary photo and nothing to download', () => {
    const payload = freezeSend({ sendId: SEND_ID, sender: SENDER, spots: [createTestSpot()], mediaBySpot: {} });

    const { spots, media, downloads } = thawSend(payload, { sendId: SEND_ID, uid: UID, now: NOW, newId: counterIds() });

    expect(spots[0].primary_photo_id).toBeUndefined();
    expect(spots[0].natural_speed).toBeUndefined();
    expect(spots[0].name).toBeUndefined();
    expect(media).toEqual([]);
    expect(downloads).toEqual([]);
  });

  it('spotIds keeps only the picked frozen spots, in payload order', () => {
    const a = createTestSpot({ name: 'A' });
    const b = createTestSpot({ name: 'B' });
    const c = createTestSpot({ name: 'C' });
    const payload = freezeSend({ sendId: SEND_ID, sender: SENDER, spots: [a, b, c], mediaBySpot: {} });

    const { spots } = thawSend(payload, { sendId: SEND_ID, uid: UID, now: NOW, newId: counterIds(), spotIds: [c.id, a.id] });

    expect(spots.map((s) => s.name)).toEqual(['A', 'C']);
  });

  it('round-trips through JSON and parseSendPayload', () => {
    const { payload } = frozenFull();

    const parsed = parseSendPayload(JSON.parse(JSON.stringify(payload)), SEND_ID);

    expect(parsed).toEqual(payload);
  });
});

describe('parseSendPayload', () => {
  const valid = (): SendPayload => {
    const spot = createTestSpot({ name: 'Pier 57', feature_types: [FeatureType.Rail], natural_speed: 2 });
    const photo = createTestMedia({ spot_id: spot.id, captured_at: '2026-10-13T14:22:05.000Z' });
    return freezeSend({ sendId: SEND_ID, sender: SENDER, spots: [spot], mediaBySpot: { [spot.id]: [photo] } });
  };
  /** A valid payload as JSON with `edit` applied to its plain-object copy. */
  const withEdit = (edit: (p: Record<string, any>) => void): unknown => {
    const p = JSON.parse(JSON.stringify(valid()));
    edit(p);
    return p;
  };

  it.each([
    ['a non-object', 'nope', 'send payload is not an object'],
    ['null', null, 'send payload is not an object'],
    ['an array', [], 'send payload is not an object'],
    ['an unknown version', withEdit((p) => (p.v = 2)), 'unknown send payload version 2'],
    ['no version', withEdit((p) => delete p.v), 'unknown send payload version undefined'],
    ['no sender', withEdit((p) => delete p.sender), 'send payload has no sender username'],
    ['a bad sender username', withEdit((p) => (p.sender.username = 'a b')), 'send payload has no sender username'],
    ['no spots', withEdit((p) => (p.spots = [])), 'send payload has no spots'],
    ['spots not an array', withEdit((p) => (p.spots = {})), 'send payload has no spots'],
    [
      'too many spots',
      withEdit((p) => (p.spots = Array.from({ length: MAX_SEND_SPOTS + 1 }, (_, i) => ({ ...p.spots[0], id: `s${i}` })))),
      'send payload has more than 100 spots',
    ],
    ['a spot without an id', withEdit((p) => delete p.spots[0].id), 'send spot 1 has no id'],
    ['a spot that is not an object', withEdit((p) => p.spots.push(7)), 'send spot 2 has no id'],
  ])('rejects %s with an Error naming the problem', (_label, json, message) => {
    expect(() => parseSendPayload(json, SEND_ID)).toThrow(new Error(message));
  });

  it('caps a send at 100 spots', () => {
    expect(MAX_SEND_SPOTS).toBe(100);
  });

  it('keeps a mixed-case sender username and a missing display name as null', () => {
    const parsed = parseSendPayload(
      withEdit((p) => {
        p.sender = { username: 'Ana_B' };
      }),
      SEND_ID,
    );

    expect(parsed.sender).toEqual({ username: 'Ana_B', display_name: null });
  });

  it('is lenient on content: bad fields fall back instead of failing the send', () => {
    const parsed = parseSendPayload(
      withEdit((p) => {
        Object.assign(p.spots[0], {
          name: 42,
          generated_name: ['x'],
          notes: {},
          feature_types: ['rail', 'trampoline', 'bank'],
          stopped: 'yes',
          natural_speed: 7,
          lat: 'north',
          lng: 10,
          extra: 'ignored',
        });
        p.extra = true;
      }),
      SEND_ID,
    );

    const [spot] = parsed.spots;
    expect(Object.keys(parsed)).toEqual(['v', 'sender', 'spots']);
    expect(Object.keys(spot)).toEqual(SPOT_KEYS);
    expect(spot).toMatchObject({
      name: null,
      generated_name: null,
      notes: null,
      feature_types: ['rail', 'bank'],
      stopped: false,
      natural_speed: null,
      lat: 0,
      lng: 0,
    });
  });

  it.each([
    ['a fractional speed', 1.5],
    ['a negative speed', -1],
    ['a string speed', '2'],
  ])('reads %s as not rated', (_label, speed) => {
    const [spot] = parseSendPayload(withEdit((p) => (p.spots[0].natural_speed = speed)), SEND_ID).spots;
    expect(spot.natural_speed).toBeNull();
  });

  it.each([
    ['a latitude past 90', { lat: 91, lng: 10 }],
    ['a longitude past 180', { lat: 10, lng: -181 }],
    ['an infinite coordinate', { lat: Infinity, lng: 10 }],
  ])('reads %s as no location', (_label, coords) => {
    const [spot] = parseSendPayload(withEdit((p) => Object.assign(p.spots[0], coords)), SEND_ID).spots;
    expect([spot.lat, spot.lng]).toEqual([0, 0]);
  });

  it.each([
    ['a non-uuid media_id', (ph: Record<string, unknown>) => (ph.media_id = '../../etc')],
    ['a path in another send', (ph: Record<string, unknown>) => (ph.path = `sends/22222222-2222-4222-8222-222222222222/${ph.media_id}.jpg`)],
    ['a path outside sends/', (ph: Record<string, unknown>) => (ph.path = `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/x/${ph.media_id}.jpg`)],
    ['a photo that is not an object', (_ph: Record<string, unknown>, p: Record<string, any>) => (p.spots[0].photos[0] = 'x')],
  ])('drops a photo with %s and keeps the spot', (_label, edit) => {
    const [spot] = parseSendPayload(
      withEdit((p) => edit(p.spots[0].photos[0], p)),
      SEND_ID,
    ).spots;

    expect(spot.photos).toEqual([]);
    expect(spot.name).toBe('Pier 57');
  });

  it('reads photos that are not an array as none, and a bad capture day as null', () => {
    const none = parseSendPayload(withEdit((p) => (p.spots[0].photos = 'x')), SEND_ID).spots[0];
    const badDay = parseSendPayload(withEdit((p) => (p.spots[0].photos[0].captured_at = 'yesterday')), SEND_ID).spots[0];

    expect(none.photos).toEqual([]);
    expect(badDay.photos[0].captured_at).toBeNull();
  });
});
