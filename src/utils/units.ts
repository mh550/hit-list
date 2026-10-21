import { UnitSystem } from '@/src/types';

// All lengths stored in meters internally

const FEET_PER_METER = 3.28084;

export function displayLength(meters: number, units: UnitSystem): string {
  if (units === UnitSystem.Imperial) {
    const feet = meters * FEET_PER_METER;
    return `${feet.toFixed(1)} ft`;
  }
  return `${meters.toFixed(1)} m`;
}

// D23: the import radius is stored in whole metres and shown and typed in the user's unit.

/** The stored radius as a whole number of feet (Imperial) or metres (Metric). */
export function radiusToDisplay(meters: number, units: UnitSystem): number {
  return Math.round(units === UnitSystem.Imperial ? meters * FEET_PER_METER : meters);
}

/** Typed feet or metres as whole metres (at least 1), or null when the text is not a positive number. */
export function radiusFromInput(text: string, units: UnitSystem): number | null {
  const trimmed = text.trim();
  const value = trimmed === '' ? NaN : Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  const meters = units === UnitSystem.Imperial ? value / FEET_PER_METER : value;
  return Math.max(1, Math.round(meters));
}

export function radiusUnitLabel(units: UnitSystem): 'ft' | 'm' {
  return units === UnitSystem.Imperial ? 'ft' : 'm';
}
