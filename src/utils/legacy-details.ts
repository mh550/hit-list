import type { UnitSystem } from '@/src/types';
import { displayLength } from '@/src/utils/units';

export interface LegacyDetailRow {
  label: string;
  value: string;
}

type Format = (value: unknown, units: UnitSystem) => string | undefined;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Old enum values ('snow_built', 'painted_steel') read as words. */
const words = (text: string) => text.replace(/_/g, ' ');

/** 'stop_description' → 'Stop description'. */
const humanise = (key: string) => {
  const text = words(key).trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

function plain(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

const enumText: Format = (v) => (typeof v === 'string' ? words(v) : undefined);
const length: Format = (v, units) => (typeof v === 'number' && Number.isFinite(v) ? displayLength(v, units) : undefined);
const outOfFive: Format = (v) => (typeof v === 'number' && Number.isFinite(v) ? `${v}/5` : undefined);

/** One requirement of an old setup option: `{ item: 'speed_humps', category: 'build', quantity: 2 }` → '2 speed humps'. */
function requirement(r: unknown): string | undefined {
  if (!isObject(r) || typeof r.item !== 'string') return undefined;
  return typeof r.quantity === 'number' && r.quantity > 1 ? `${r.quantity} ${words(r.item)}` : words(r.item);
}

/** '2 options: winch; drop in platform + 2 speed humps'. An option it cannot read is shown as its stored JSON. */
const setupOptions: Format = (v) => {
  if (!Array.isArray(v)) return undefined;
  const options = v.map((option) => {
    const items = isObject(option) && Array.isArray(option.requires) ? option.requires.map(requirement) : [];
    return items.length > 0 && items.every((i) => i !== undefined) ? items.join(' + ') : JSON.stringify(option);
  });
  return `${options.length} ${options.length === 1 ? 'option' : 'options'}: ${options.join('; ')}`;
};

/**
 * The archived keys migration 3 writes (`SpotLegacy`), in display order. Setup options go last among them: they are
 * the longest row. The `raw_*` columns (an old column that was not JSON, kept verbatim) come after any unknown key.
 */
const KNOWN: [key: string, label: string, format?: Format][] = [
  ['custom_type', 'Custom type'],
  ['shape', 'Shape'],
  ['length_m', 'Length', length],
  ['height_m', 'Height', length],
  ['width_m', 'Width', length],
  ['material', 'Material', enumText],
  ['stop_type', 'Stop type', enumText],
  ['stop_description', 'Stop description'],
  ['removable', 'Removable'],
  ['difficulty', 'Difficulty', outOfFive],
  ['landing_difficulty', 'Landing difficulty', outOfFive],
  ['landing_surface', 'Landing surface', enumText],
  ['intensity', 'Intensity', outOfFive],
  ['bustability', 'Bustability', outOfFive],
  ['bustability_notes', 'Bustability notes'],
  ['setup_options', 'Setup options', setupOptions],
];

const RAW: [key: string, label: string][] = [
  ['raw_feature', 'Feature (unreadable)'],
  ['raw_in_run', 'In-run (unreadable)'],
  ['raw_landing', 'Landing (unreadable)'],
  ['raw_metadata', 'Other (unreadable)'],
];

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/**
 * The "Older details" rows for a spot's `legacy_json` (spec §2.4, D26): a label and a display string per archived
 * value, lengths in the user's units (the archive stores metres). Empty values are skipped; a key it does not know is
 * shown with its key humanised; a value of an unexpected type is shown as plain text, so this never throws.
 */
export function formatLegacyDetails(legacy: Record<string, unknown>, units: UnitSystem): LegacyDetailRow[] {
  const row = (key: string, label: string, format?: Format): LegacyDetailRow[] => {
    const value = legacy[key];
    if (isEmpty(value)) return [];
    return [{ label, value: format?.(value, units) ?? plain(value) }];
  };
  const listed = new Set([...KNOWN, ...RAW].map(([key]) => key));
  return [
    ...KNOWN.flatMap(([key, label, format]) => row(key, label, format)),
    ...Object.keys(legacy)
      .filter((key) => !listed.has(key))
      .flatMap((key) => row(key, humanise(key))),
    ...RAW.flatMap(([key, label]) => row(key, label)),
  ];
}
