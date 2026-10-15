import type { Spot } from '@/src/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `Oct 13, 2:22 PM` in the phone's local zone. Built by hand rather than with toLocaleString so
 * Hermes and Node agree and no ICU narrow no-break space sneaks in. Invalid dates give ''.
 */
export function formatSpotTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${h % 12 || 12}:${minutes} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * D4: the user's name; otherwise `Untitled · <Town> · Oct 13, 2:22 PM`, where the town is the
 * reverse-geocoded `generated_name` and is left out when unknown.
 */
export function getSpotDisplayName(spot: Spot): string {
  if (spot.name) return spot.name;
  return ['Untitled', spot.generated_name, formatSpotTime(spot.created_at)].filter(Boolean).join(' · ');
}
