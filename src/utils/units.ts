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

/** The one-decimal text a stored metre value is shown as in a dimension field ('' when unset). */
export function initialDimText(meters: number | undefined, units: UnitSystem): string {
  return meters != null ? metersToDisplay(meters, units).toFixed(1) : '';
}

/** A plain positive decimal with at most one '.' or ',' separator (no signs, exponents or hex). */
const DECIMAL_INPUT = /^(\d+[.,]?\d*|[.,]\d+)$/;

/**
 * The metre value to save for a dimension field.
 * - Text unchanged from its initial display text: the stored value, exactly (no rounding drift).
 * - Empty text: undefined (the dimension is cleared).
 * - A finite number > 0 in the user's units (dot or comma decimal): converted to metres.
 * - Anything else: the stored value (undefined if none). Never NaN.
 */
export function dimensionFromInput(
  text: string,
  initialText: string,
  stored: number | undefined,
  units: UnitSystem,
): number | undefined {
  if (text === initialText) return stored;
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  if (!DECIMAL_INPUT.test(trimmed)) return stored;
  const parsed = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) return stored;
  return inputToMeters(parsed, units);
}
