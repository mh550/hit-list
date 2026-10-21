// Range mode of the natural-speed scale (Filter sheet). Pure, so the tap rules are unit tested apart
// from the component. The plan's tap table: docs/plans/2026-10-20-m5-filters-list.md.
import { SPEED_LABELS } from '@/src/constants/labels';
import type { NaturalSpeed } from '@/src/types';

export type SpeedRange = [NaturalSpeed, NaturalSpeed];

export interface SpeedRangeStep {
  range: SpeedRange | undefined;
  /** The first end of a range in progress; it counts only while `range` is `[anchor, anchor]`. */
  anchor: NaturalSpeed | undefined;
}

export function inSpeedRange(range: SpeedRange | undefined, level: NaturalSpeed): boolean {
  return range !== undefined && range[0] <= level && level <= range[1];
}

/** A live anchor: the range is still the single value it started. A stale one (outside Reset) is ignored. */
export function liveAnchor(range: SpeedRange | undefined, anchor: NaturalSpeed | undefined) {
  return anchor !== undefined && range?.[0] === anchor && range[1] === anchor ? anchor : undefined;
}

export function nextSpeedRange(
  range: SpeedRange | undefined,
  anchor: NaturalSpeed | undefined,
  tapped: NaturalSpeed,
): SpeedRangeStep {
  const a = liveAnchor(range, anchor);
  if (a !== undefined) {
    return { range: [Math.min(a, tapped), Math.max(a, tapped)] as SpeedRange, anchor: undefined };
  }
  if (inSpeedRange(range, tapped)) return { range: undefined, anchor: undefined };
  return { range: [tapped, tapped], anchor: tapped };
}

/** 'Any' · 'Some' · 'Little to Enough'. */
export function speedRangeLabel(range: SpeedRange | undefined): string {
  if (range === undefined) return 'Any';
  const [low, high] = range;
  if (low === high) return SPEED_LABELS[low].label;
  return `${SPEED_LABELS[low].label} to ${SPEED_LABELS[high].label}`;
}
