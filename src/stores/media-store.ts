import { create } from 'zustand';
import type { Media } from '@/src/types';

const byCapture = (a: Media, b: Media) => a.created_at.localeCompare(b.created_at);

interface MediaState {
  /** Media per spot id, oldest first. */
  mediaBySpot: Record<string, Media[]>;
  setAll: (media: Media[]) => void;
  add: (media: Media) => void;
  remove: (id: string) => void;
}

export const useMediaStore = create<MediaState>((set) => ({
  mediaBySpot: {},

  setAll: (media) => {
    const mediaBySpot: Record<string, Media[]> = {};
    for (const m of media) (mediaBySpot[m.spot_id] ??= []).push(m);
    for (const list of Object.values(mediaBySpot)) list.sort(byCapture);
    set({ mediaBySpot });
  },

  add: (m) =>
    set((s) => ({
      mediaBySpot: {
        ...s.mediaBySpot,
        [m.spot_id]: [...(s.mediaBySpot[m.spot_id] ?? []), m].sort(byCapture),
      },
    })),

  remove: (id) =>
    set((s) => ({
      mediaBySpot: Object.fromEntries(
        Object.entries(s.mediaBySpot).map(([spotId, list]) => [spotId, list.filter((m) => m.id !== id)]),
      ),
    })),
}));
