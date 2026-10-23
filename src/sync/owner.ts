import { useSyncStore } from '@/src/stores/sync-store';

/**
 * The owner a new spot or list gets: the signed-in rider once adoption made the phone theirs, else none (signed out,
 * or the moment before adoption, which then takes the row). A photo takes its spot's owner in insertMedia.
 */
export function currentOwnerId(): string | undefined {
  return useSyncStore.getState().adoptedUserId ?? undefined;
}
