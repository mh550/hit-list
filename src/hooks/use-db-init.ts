import { useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { migrateDb, getSpots, getAllMedia, getUserSettings, getHitLists, getListMemberships } from '@/src/db';
import { useSpotActions } from '@/src/hooks/use-spot-actions';
import { useSpotsStore } from '@/src/stores';
import { useSettingsStore } from '@/src/stores/settings-store';
import { useMediaStore } from '@/src/stores/media-store';
import { useHitListsStore } from '@/src/stores/hit-lists-store';
import type { Spot } from '@/src/types';
import { backfillTowns } from '@/src/utils/reverse-geocode';

export function useDbInit(): { isReady: boolean; upgradeFailed: boolean } {
  const db = useSQLiteContext();
  const setSpots = useSpotsStore((s) => s.setSpots);
  const { updateSpot } = useSpotActions();
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const setAllMedia = useMediaStore((s) => s.setAll);
  const setLists = useHitListsStore((s) => s.setLists);
  const setMemberships = useHitListsStore((s) => s.setMemberships);
  const [isReady, setIsReady] = useState(false);
  const [upgradeFailed, setUpgradeFailed] = useState(false);

  useEffect(() => {
    (async () => {
      // A failed upgrade leaves the DB at its last good version, where this build's writes fail, so DBInitializer
      // blocks the app (D28); nothing on disk is lost and the next launch retries. The load still goes ahead, each
      // part on its own: below version 5 getSpots and getAllMedia throw, but the user's settings still load.
      try {
        await migrateDb(db);
      } catch (err) {
        console.error('[useDbInit] Database migration failed:', err);
        setUpgradeFailed(true);
      }
      let spots: Spot[] = [];
      try {
        spots = await getSpots(db);
        setSpots(spots);
      } catch (err) {
        console.error('[useDbInit] Failed to initialize database (spots):', err);
      }
      try {
        setAllMedia(await getAllMedia(db));
      } catch (err) {
        console.error('[useDbInit] Failed to initialize database (media):', err);
      }
      try {
        setLists(await getHitLists(db));
      } catch (err) {
        console.error('[useDbInit] Failed to initialize database (hit lists):', err);
      }
      try {
        setMemberships(await getListMemberships(db));
      } catch (err) {
        console.error('[useDbInit] Failed to initialize database (memberships):', err);
      }
      try {
        const settings = await getUserSettings(db);
        if (settings) {
          loadSettings(settings);
        }
      } catch (err) {
        console.error('[useDbInit] Failed to initialize database (settings):', err);
      }
      setIsReady(true); // even after an error, so the splash screen never strands the app
      // In the background, after the app is usable: towns for untitled spots (D4).
      void backfillTowns(spots, updateSpot);
    })();
    // All stable, so this still runs once.
  }, [db, setSpots, updateSpot, setAllMedia, setLists, setMemberships, loadSettings]);

  return { isReady, upgradeFailed };
}
