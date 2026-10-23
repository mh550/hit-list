export { DB_NAME, migrateDb } from './schema';
export type { SpotLegacy } from './schema';
export { insertSpot, getSpot, getSpots, getSpotLegacy, updateSpot, softDeleteSpot } from './spots';
export { insertMedia, getMediaForSpot, getAllMedia, deleteMedia } from './media';
export { getSetting, setSetting, getUserSettings, saveUserSettings } from './settings';
export {
  insertHitList,
  getHitLists,
  updateHitList,
  softDeleteHitList,
  addSpotsToList,
  removeSpotFromList,
  getListMemberships,
} from './hit-lists';
