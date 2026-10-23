import { FeatureType, type MemberRole, type NaturalSpeed } from '@/src/types';

/** Display labels for feature types: the filter chips, the list row and the map callout. */
export const FEATURE_TYPE_LABELS: Record<FeatureType, string> = {
  [FeatureType.Rail]: 'Rail',
  [FeatureType.Ledge]: 'Ledge',
  [FeatureType.Bank]: 'Bank',
  [FeatureType.Hip]: 'Hip',
  [FeatureType.StairSet]: 'Stair set',
  [FeatureType.Gap]: 'Gap',
  [FeatureType.WallRide]: 'Wall ride',
  [FeatureType.QuarterPipe]: 'Quarter pipe',
};

/** Natural speed words and descriptions, spec §2.3 (D21). */
export const SPEED_LABELS: Record<NaturalSpeed, { label: string; description: string }> = {
  0: { label: 'None', description: 'Flat. You make all the speed.' },
  1: { label: 'Little', description: 'Slight slope. Needs a lot of help.' },
  2: { label: 'Some', description: 'Some slope. Needs a bit of help.' },
  3: { label: 'Enough', description: 'Rolls in with speed for most tricks.' },
  4: { label: 'Too much', description: 'Steep. You have to scrub speed.' },
};

/** The two roles in a shared hit list (D42): the Share sheet, the members screen and its role menu. */
export const ROLE_LABELS: Record<MemberRole, string> = {
  add: 'Can add spots',
  view: 'View only',
};
