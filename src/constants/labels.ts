import { FeatureType } from '@/src/types';

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
