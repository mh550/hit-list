import { useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { insertMedia } from '@/src/db';
import { useMediaStore } from '@/src/stores/media-store';
import { persistPhoto } from '@/src/utils/photo-storage';
import type { Media } from '@/src/types';

export type NewPhoto = Omit<Media, 'file_path'> & { sourceUri: string };

/**
 * Saving photos is DB-first (unlike useSpotActions): each photo is copied into app storage
 * (D3), its row inserted, and only rows that saved reach the store, in one update.
 */
export function useMediaActions() {
  const db = useSQLiteContext();
  const addMany = useMediaStore((s) => s.addMany);

  const savePhotos = useCallback(
    async (photos: NewPhoto[]) => {
      const saved = await Promise.all(
        photos.map(async ({ sourceUri, ...fields }) => {
          const media: Media = { ...fields, file_path: await persistPhoto(sourceUri, fields.spot_id, fields.id) };
          try {
            await insertMedia(db, media);
            return media;
          } catch (err) {
            console.error('[useMediaActions] insertMedia failed:', err);
            return null;
          }
        }),
      );
      addMany(saved.filter((m): m is Media => m !== null));
    },
    [db, addMany],
  );

  return { savePhotos };
}
