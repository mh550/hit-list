import { useEffect, useState } from 'react';

import { getSupabase } from '@/src/sync/client';
import { errorMessage } from '@/src/sync/errors';
import { cachedPhotoUri } from '@/src/sync/photos';
import type { Media } from '@/src/types';
import { resolvePhotoUri } from '@/src/utils/photo-storage';

export interface PhotoUri {
  /** undefined while another rider's photo is still downloading, or when it failed. */
  uri?: string;
  /** Its download failed (refused, gone, offline): show the placeholder. A later mount tries again (D91). */
  failed: boolean;
}

type PhotoRef = Pick<Media, 'id' | 'spot_id' | 'file_path' | 'owner_id'>;

/**
 * The uri a photo shows from (S8); none for no photo. The rider's own resolves at once; another rider's (`cache/…`) comes from the cache,
 * downloaded on first use (cachedPhotoUri), so its uri arrives a moment later.
 */
export function usePhotoUri(media: PhotoRef | undefined): PhotoUri {
  const { id = '', spot_id = '', file_path = '', owner_id } = media ?? {};
  const own = !file_path.startsWith('cache/');
  const [loaded, setLoaded] = useState<(PhotoUri & { path: string }) | null>(null);

  useEffect(() => {
    if (own) return;
    let live = true;
    cachedPhotoUri(getSupabase(), { id, spot_id, file_path, owner_id }).then(
      (uri) => {
        if (live) setLoaded({ path: file_path, uri, failed: false });
      },
      (err: unknown) => {
        console.warn(`[photos] could not download photo ${id}:`, errorMessage(err));
        if (live) setLoaded({ path: file_path, failed: true });
      },
    );
    return () => {
      live = false;
    };
  }, [own, id, spot_id, file_path, owner_id]);

  if (!media) return { failed: false };
  if (own) return { uri: resolvePhotoUri(file_path), failed: false };
  if (loaded?.path === file_path) return { uri: loaded.uri, failed: loaded.failed };
  return { failed: false };
}
