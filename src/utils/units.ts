import { UnitSystem } from '@/src/types';

// All dimensions stored in meters internally

export function displayLength(meters: number, units: UnitSystem): string {
  if (units === UnitSystem.Imperial) {
    const feet = meters * 3.28084;
    return `${feet.toFixed(1)} ft`;
  }
  return `${meters.toFixed(1)} m`;
}

export function inputToMeters(value: number, units: UnitSystem): number {
  if (units === UnitSystem.Imperial) {
    return value / 3.28084;
  }
  return value;
}

export function metersToDisplay(meters: number, units: UnitSystem): number {
  if (units === UnitSystem.Imperial) {
    return meters * 3.28084;
  }
  return meters;
}
