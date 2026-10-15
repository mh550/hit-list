import { StopType } from '@/src/types';

/** Display labels for skate-stop types, used by the edit chips and the detail screen. */
export const STOP_TYPE_LABELS: Record<StopType, string> = {
  [StopType.Knobs]: 'Knobs',
  [StopType.Caps]: 'Caps',
  [StopType.Brackets]: 'Brackets',
  [StopType.Welds]: 'Welds',
  [StopType.Other]: 'Other',
};
