// The frozen copy a send carries (S7, D40, docs/plans/2026-10-22-s7-send.md "Payload"): pure freeze / parse / thaw.
// Only the shareable fields go in: never an owner, a timestamp, a file path, EXIF or the legacy archive.
import { FeatureType, type Media, type NaturalSpeed, type Spot } from '@/src/types';
import { isKnownLocation, NO_LOCATION } from './geo';
import { isObject } from './is-object';
import { photoRelativePath } from './photo-storage';
import { spotPhotos } from './spot-photos';

export const SEND_PAYLOAD_VERSION = 1;
/** At most this many spots in one send (D79). */
export const MAX_SEND_SPOTS = 100;

export interface SendPhoto {
  media_id: string;
  path: string; // 'sends/<send_id>/<media_id>.jpg'
  captured_at: string | null; // the day only, 'YYYY-MM-DD' (D46)
}

export interface FrozenSpot {
  id: string; // the sender's spot id (to pick spots by; never a user id)
  name: string | null;
  generated_name: string | null;
  lat: number; // NO_LOCATION freezes as 0, 0
  lng: number;
  feature_types: FeatureType[];
  stopped: boolean;
  natural_speed: NaturalSpeed | null; // 0 = None stays 0; not rated = null
  notes: string | null;
  photos: SendPhoto[]; // primary first
}

export interface SendSender {
  username: string;
  display_name: string | null;
}

export interface SendPayload {
  v: typeof SEND_PAYLOAD_VERSION;
  sender: SendSender; // the server overwrites it from the sender's profile (D80)
  spots: FrozenSpot[];
}

/** One photo to fetch when a send is saved: the send's object → the new media row's file. */
export interface SendDownload {
  path: string;
  localRelativePath: string;
  mediaId: string;
  spotId: string;
}

const SENDER_USERNAME = /^[A-Za-z0-9_.]{3,20}$/; // profiles_username_format; citext keeps the case
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}/;
const FEATURE_TYPES = new Set<string>(Object.values(FeatureType));

export const sendPhotoPath = (sendId: string, mediaId: string) => `sends/${sendId}/${mediaId}.jpg`;

/** A frozen spot's name, or 'Untitled' (the Inbox row and Pick spots; the town shows beside it). */
export const frozenSpotTitle = (spot: Pick<FrozenSpot, 'name'>) => spot.name || 'Untitled';

/** 'YYYY-MM-DD' from an ISO or EXIF-local time, or null. */
const captureDay = (value: unknown): string | null =>
  typeof value === 'string' && DAY.test(value) ? value.slice(0, 10) : null;

/** The payload of one send: `spots` in the given order, each with its live photos (`mediaBySpot`), primary first. */
export function freezeSend({
  sendId,
  sender,
  spots,
  mediaBySpot,
}: {
  sendId: string;
  sender: SendSender;
  spots: Spot[];
  mediaBySpot: Record<string, Media[] | undefined>;
}): SendPayload {
  return {
    v: SEND_PAYLOAD_VERSION,
    sender: { username: sender.username, display_name: sender.display_name },
    spots: spots.map((spot) => ({
      id: spot.id,
      name: spot.name ?? null,
      generated_name: spot.generated_name ?? null,
      lat: spot.location.latitude,
      lng: spot.location.longitude,
      feature_types: [...spot.feature_types],
      stopped: spot.stopped,
      natural_speed: spot.natural_speed ?? null,
      notes: spot.notes ?? null,
      photos: spotPhotos(spot, mediaBySpot[spot.id]).map((m) => ({
        media_id: m.id,
        path: sendPhotoPath(sendId, m.id),
        captured_at: captureDay(m.captured_at),
      })),
    })),
  };
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const isCoordinate = (value: unknown, limit: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;

function parsePhoto(value: unknown, sendId: string): SendPhoto | null {
  if (!isObject(value)) return null;
  const { media_id: mediaId, path } = value;
  // A path is never trusted: it must be exactly this send's object for a uuid media id.
  if (typeof mediaId !== 'string' || !UUID.test(mediaId) || path !== sendPhotoPath(sendId, mediaId)) return null;
  return { media_id: mediaId, path, captured_at: captureDay(value.captured_at) };
}

function parseSpot(value: unknown, index: number, sendId: string): FrozenSpot {
  if (!isObject(value) || typeof value.id !== 'string' || !value.id) throw new Error(`send spot ${index + 1} has no id`);
  const { lat, lng, natural_speed: speed } = value;
  const located = isCoordinate(lat, 90) && isCoordinate(lng, 180);
  return {
    id: value.id,
    name: text(value.name),
    generated_name: text(value.generated_name),
    lat: located ? lat : NO_LOCATION.latitude,
    lng: located ? lng : NO_LOCATION.longitude,
    feature_types: Array.isArray(value.feature_types)
      ? (value.feature_types.filter((t) => typeof t === 'string' && FEATURE_TYPES.has(t)) as FeatureType[])
      : [],
    stopped: value.stopped === true,
    natural_speed: typeof speed === 'number' && Number.isInteger(speed) && speed >= 0 && speed <= 4 ? (speed as NaturalSpeed) : null,
    notes: text(value.notes),
    photos: Array.isArray(value.photos)
      ? value.photos.map((p) => parsePhoto(p, sendId)).filter((p): p is SendPhoto => p !== null)
      : [],
  };
}

/**
 * A send row's payload as the app can use it. Throws an Error naming the problem when it is not a send at all; is
 * lenient on content (a bad field falls back, a photo that isn't this send's own object is dropped, unknown keys go).
 */
export function parseSendPayload(json: unknown, sendId: string): SendPayload {
  if (!isObject(json)) throw new Error('send payload is not an object');
  if (json.v !== SEND_PAYLOAD_VERSION) throw new Error(`unknown send payload version ${String(json.v)}`);
  const sender = json.sender;
  if (!isObject(sender) || typeof sender.username !== 'string' || !SENDER_USERNAME.test(sender.username)) {
    throw new Error('send payload has no sender username');
  }
  const spots = json.spots;
  if (!Array.isArray(spots) || spots.length === 0) throw new Error('send payload has no spots');
  if (spots.length > MAX_SEND_SPOTS) throw new Error(`send payload has more than ${MAX_SEND_SPOTS} spots`);
  return {
    v: SEND_PAYLOAD_VERSION,
    sender: { username: sender.username, display_name: text(sender.display_name) },
    spots: spots.map((spot, i) => parseSpot(spot, i, sendId)),
  };
}

/**
 * The rider's own copies of a send (or of the picked `spotIds`): fresh ids, owned by `uid`, created `now`, marked with
 * the send and 'From @sender'; each photo becomes a media draft under the new spot plus the download that fills it.
 */
export function thawSend(
  payload: SendPayload,
  {
    sendId,
    uid,
    now,
    newId,
    spotIds,
  }: { sendId: string; uid: string; now: string; newId: () => string; spotIds?: readonly string[] },
): { spots: Spot[]; media: Media[]; downloads: SendDownload[] } {
  const picked = spotIds ? new Set(spotIds) : null;
  const spots: Spot[] = [];
  const media: Media[] = [];
  const downloads: SendDownload[] = [];
  for (const frozen of payload.spots) {
    if (picked && !picked.has(frozen.id)) continue;
    const spotId = newId();
    const location = { latitude: frozen.lat, longitude: frozen.lng };
    const located = isKnownLocation(location);
    const photoIds = frozen.photos.map((photo) => {
      const mediaId = newId();
      const localRelativePath = photoRelativePath(spotId, mediaId);
      media.push({
        id: mediaId,
        spot_id: spotId,
        file_path: localRelativePath,
        captured_at: photo.captured_at ?? undefined,
        location: located ? location : undefined,
        created_at: now,
        owner_id: uid,
      });
      downloads.push({ path: sendPhotoPath(sendId, photo.media_id), localRelativePath, mediaId, spotId });
      return mediaId;
    });
    spots.push({
      id: spotId,
      name: frozen.name ?? undefined,
      generated_name: frozen.generated_name ?? undefined,
      location,
      created_at: now,
      updated_at: now,
      feature_types: [...frozen.feature_types],
      stopped: frozen.stopped,
      natural_speed: frozen.natural_speed ?? undefined,
      notes: frozen.notes ?? undefined,
      primary_photo_id: photoIds[0],
      owner_id: uid,
      copied_from_send: sendId,
      from_username: payload.sender.username,
    });
  }
  return { spots, media, downloads };
}
