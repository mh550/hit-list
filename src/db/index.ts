export { DB_NAME, migrateDb, MIGRATIONS, LATEST_SCHEMA_VERSION, getSchemaVersion } from './schema';
export type { Migration } from './schema';
export { insertSpot, getSpot, getSpots, updateSpot, softDeleteSpot } from './spots';
export { insertMedia, getMediaForSpot, deleteMedia } from './media';
export { getSetting, setSetting, getUserSettings, saveUserSettings } from './settings';
