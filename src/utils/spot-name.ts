import type { Spot } from '@/src/types';

/**
 * Name fallback chain:
 * 1. User-provided name
 * 2. generated_name (reverse-geocoded)
 * 3. "Untitled Spot — {date}"
 */
export function getSpotDisplayName(spot: Spot): string {
  if (spot.name) return spot.name;
  if (spot.generated_name) return spot.generated_name;

  const date = new Date(spot.created_at);
  const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `Untitled Spot — ${formatted}`;
}
