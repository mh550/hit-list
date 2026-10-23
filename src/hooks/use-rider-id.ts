import { useAuthStore } from '@/src/stores/auth-store';
import { useSyncStore } from '@/src/stores/sync-store';

/** riderId() as a hook (src/sync/owner.ts): the signed-in rider, else the phone's account; whose spots are 'mine'. */
export function useRiderId(): string | null {
  const signedIn = useAuthStore((s) => s.userId);
  const phone = useSyncStore((s) => s.phoneUserId);
  return signedIn ?? phone;
}
