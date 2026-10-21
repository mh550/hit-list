import { UnitSystem } from '@/src/types';

// All lengths stored in meters internally

export function displayLength(meters: number, units: UnitSystem): string {
  if (units === UnitSystem.Imperial) {
    const feet = meters * 3.28084;
    return `${feet.toFixed(1)} ft`;
  }
  return `${meters.toFixed(1)} m`;
}
