// ── Enums ──────────────────────────────────────────────

export enum SpotStatus {
  Draft = 'draft',
  Complete = 'complete',
}

export enum FeatureType {
  Rail = 'rail',
  Ledge = 'ledge',
  Bank = 'bank',
  Hip = 'hip',
  StairSet = 'stair_set',
  Gap = 'gap',
  WallRide = 'wall_ride',
  QuarterPipe = 'quarter_pipe',
  Other = 'other',
}

export enum Material {
  Aluminum = 'aluminum',
  Concrete = 'concrete',
  Steel = 'steel',
  PaintedSteel = 'painted_steel',
  Wood = 'wood',
  Plastic = 'plastic',
  Stone = 'stone',
  Other = 'other',
}

export enum StopType {
  Knobs = 'knobs',
  Caps = 'caps',
  Brackets = 'brackets',
  Welds = 'welds',
  Other = 'other',
}

export enum GearItem {
  Bungee = 'bungee',
  DropInPlatform = 'drop_in_platform',
  Scaffolding = 'scaffolding',
  ShovelPull = 'shovel_pull',
  Winch = 'winch',
}

export enum BuildItem {
  SpeedHumps = 'speed_humps',
  LipBuild = 'lip_build',
  LandingBuild = 'landing_build',
}

export enum LandingSurface {
  SnowNatural = 'snow_natural',
  SnowBuilt = 'snow_built',
  Concrete = 'concrete',
  Asphalt = 'asphalt',
  Grass = 'grass',
  Dirt = 'dirt',
  Other = 'other',
}

export enum UnitSystem {
  Imperial = 'imperial',
  Metric = 'metric',
}

export enum SortField {
  Name = 'name',
  Distance = 'distance',
  DateAdded = 'date_added',
  Intensity = 'intensity',
}

export enum SortDirection {
  Asc = 'asc',
  Desc = 'desc',
}

export type RequirementCategory = 'gear' | 'build';

// ── Data Types ─────────────────────────────────────────

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface Requirement {
  item: GearItem | BuildItem;
  category: RequirementCategory;
  quantity?: number;
}

export interface SetupOption {
  requires: Requirement[];
}

export interface SkateStopInfo {
  is_stopped: boolean;
  stop_type?: StopType;
  stop_description?: string;
  removable?: boolean;
}

export interface Dimensions {
  length?: number;
  height?: number;
  width?: number;
}

export interface FeatureDetails {
  type?: FeatureType;
  custom_type?: string;
  shape?: string;
  dimensions?: Dimensions;
  material?: Material;
  skate_stops?: SkateStopInfo;
  difficulty?: number; // 1-5
}

export interface InRun {
  natural_speed?: number; // 1-5
  setup_options: SetupOption[];
}

export interface Landing {
  difficulty?: number; // 1-5
  surface?: LandingSurface;
}

export interface SpotMetadata {
  intensity?: number; // 1-5
  bustability?: number; // 1-5
  bustability_notes?: string;
  notes?: string;
}

export interface Spot {
  id: string;
  name?: string;
  generated_name?: string;
  location: GeoPoint;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  deleted_at?: string; // ISO 8601
  status: SpotStatus;
  feature: FeatureDetails;
  in_run: InRun;
  landing: Landing;
  metadata: SpotMetadata;
  primary_photo_id?: string;
}

/** A patch for a spot; `null` for `name` or `primary_photo_id` clears the stored value (undefined keeps it). */
export type SpotUpdate = Omit<Partial<Spot>, 'name' | 'primary_photo_id'> & {
  name?: string | null;
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
  gear: GearItem[];
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
  natural_speed_min?: number;
  natural_speed_max?: number;
  gear: GearItem[];
  exclude_build: BuildItem[];
  bustability_min?: number;
  bustability_max?: number;
  intensity_min?: number;
  intensity_max?: number;
  show_drafts: boolean;
}

export const DEFAULT_FILTERS: SpotFilters = {
  types: [],
  gear: [],
  exclude_build: [],
  show_drafts: true,
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  units: UnitSystem.Imperial,
  batch_import_radius: 50,
  gear: [],
};
