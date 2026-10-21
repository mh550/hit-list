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

/** Natural speed on the in-run, 0 None · 1 Little · 2 Some · 3 Enough · 4 Too much (D21); 0 is a real value, undefined = not rated. */
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
}

/** A patch for a spot; `null` for `name`, `notes`, `natural_speed` or `primary_photo_id` clears the stored value (undefined keeps it). */
export type SpotUpdate = Omit<Partial<Spot>, 'name' | 'notes' | 'natural_speed' | 'primary_photo_id'> & {
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
}

export interface UserSettings {
  units: UnitSystem;
  batch_import_radius: number; // meters
}

export interface SyncQueueItem {
  id: string;
  action: 'create' | 'update' | 'delete';
  entity_type: 'spot' | 'media';
  entity_id: string;
  payload: string; // JSON
  created_at: string; // ISO 8601
  retry_count: number;
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
