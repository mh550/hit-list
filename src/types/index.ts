// ── Enums ──────────────────────────────────────────────

export enum FeatureType {
  Rail = 'rail',
  Ledge = 'ledge',
  Bank = 'bank',
  Hip = 'hip',
  StairSet = 'stair_set',
  Gap = 'gap',
  WallRide = 'wall_ride',
  QuarterPipe = 'quarter_pipe',
}

export enum UnitSystem {
  Imperial = 'imperial',
  Metric = 'metric',
}

export enum SortField {
  Name = 'name',
  Distance = 'distance',
  DateAdded = 'date_added',
}

export enum SortDirection {
  Asc = 'asc',
  Desc = 'desc',
}

/** Natural speed on the in-run, 0–4, words in `SPEED_LABELS` (src/constants/labels.ts, D21); 0 is a real value, undefined = not rated. */
export type NaturalSpeed = 0 | 1 | 2 | 3 | 4;

// ── Data Types ─────────────────────────────────────────

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface Spot {
  id: string;
  name?: string;
  generated_name?: string;
  location: GeoPoint;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  deleted_at?: string; // ISO 8601
  feature_types: FeatureType[]; // [] = untagged, ordered as tapped
  stopped: boolean;
  natural_speed?: NaturalSpeed;
  notes?: string;
  primary_photo_id?: string;
  owner_id?: string; // the account it belongs to (S5); undefined = phone-only, not adopted
  copied_from_send?: string; // S7: the send this spot was saved from; set once on insert
  from_username?: string; // S7: the sender's @username as frozen in that send ('From @ana'); set once on insert
  owner_username?: string; // S8: another rider's @username from the profiles mirror, read by getSpots; never written
}

/** A patch for a spot (never its owner: adoption sets that, S5-06; never its send fields, S7); `null` for `name`, `notes`, `natural_speed` or `primary_photo_id` clears the stored value (undefined keeps it). */
export type SpotUpdate = Omit<
  Partial<Spot>,
  | 'name'
  | 'notes'
  | 'natural_speed'
  | 'primary_photo_id'
  | 'owner_id'
  | 'copied_from_send'
  | 'from_username'
  | 'owner_username'
> & {
  name?: string | null;
  notes?: string | null;
  natural_speed?: NaturalSpeed | null;
  primary_photo_id?: string | null;
};

export interface Media {
  id: string;
  spot_id: string;
  file_path: string;
  captured_at?: string; // ISO 8601, when the photo was taken (EXIF); kept apart from the spot's created_at
  location?: GeoPoint;
  created_at: string; // ISO 8601
  uploaded_by?: string; // the account that added it; unset until accounts exist (spec: User, [FUTURE])
  owner_id?: string; // always its spot's owner (S5); undefined = phone-only
}

export type HitListKind = 'manual' | 'area';

/** A named group of spots (many-to-many: a spot can sit in several lists). Deleting a list never deletes its spots. */
export interface HitList {
  id: string;
  name: string;
  kind: HitListKind; // 'manual' in S1; 'area' from S2
  owner_id?: string; // the account it belongs to (S5); undefined = phone-only, not adopted
  owner_username?: string; // S8: the owner's @username from the profiles mirror, never stored
  shared: boolean; // false in S1; S8
  member_count?: number; // computed in S8, never stored
  members?: HitListMember[]; // S8: the hit_list_members mirror, joined members first; undefined = none
  area_center?: GeoPoint; // S2; both lat and lng NULL → undefined
  area_radius_m?: number; // S2, whole metres like batch_import_radius
  area_filters?: SpotFilters; // S2, area_filters_json
  area_place?: string; // S2, "Capitol Hill"
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  deleted_at?: string; // ISO 8601
}

export type MemberRole = 'add' | 'view'; // D42: 'Can add spots' / 'View only'
export type MemberStatus = 'invited' | 'member'; // D57: 'invited' until Join

/** One hit_list_members row as the local mirror holds it (S8, migration 8). The owner is implicit (owner_id). */
export interface ListMember {
  list_id: string;
  user_id: string;
  role: MemberRole;
  status: MemberStatus;
  joined_at?: string; // ISO 8601, set by the server on Join
}

/** A list's member as the store carries it; `username` from the profiles mirror (D72), undefined when unknown. */
export interface HitListMember {
  user_id: string;
  username?: string;
  role: MemberRole;
  status: MemberStatus;
}

/** One spot in one list (hit_list_spots). */
export interface HitListSpot {
  list_id: string;
  spot_id: string;
  added_by?: string; // undefined until accounts
  added_at: string; // ISO 8601
}

/**
 * A patch for a list; undefined keeps the stored value (S2 adds the area fields). `area_place: null` clears the place
 * (as `null` does in a SpotUpdate).
 */
export type HitListUpdate = Partial<
  Pick<HitList, 'name' | 'shared' | 'updated_at' | 'area_center' | 'area_radius_m' | 'area_filters'>
> & {
  area_place?: string | null;
};

/** What createList needs beyond the name: a manual list, or an area list's circle, place and filters. */
export type NewHitList =
  | { kind: 'manual' }
  | { kind: 'area'; area_center: GeoPoint; area_radius_m: number; area_place?: string; area_filters: SpotFilters };

/**
 * Another rider as the server's profiles row shows them (S6). `username` is null until they onboard, or when the
 * server doesn't let this rider read them (a request you sent, a rider you blocked) and the phone never learnt it.
 */
export interface FriendProfile {
  id: string;
  username: string | null;
  display_name: string | null;
}

export interface UserSettings {
  units: UnitSystem;
  batch_import_radius: number; // meters
}

// ── Filter Types ───────────────────────────────────────

export interface SpotFilters {
  types: FeatureType[];
  /** undefined = any; true = only stopped spots; false = only spots that are not stopped. */
  stopped?: boolean;
  natural_speed_min?: NaturalSpeed;
  natural_speed_max?: NaturalSpeed;
}

export const DEFAULT_FILTERS: SpotFilters = {
  types: [],
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  units: UnitSystem.Imperial,
  batch_import_radius: 50,
};
