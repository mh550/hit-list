import { UnitSystem } from '@/src/types';
import { formatLegacyDetails } from '@/src/utils/legacy-details';
import v2Spots from './fixtures/v2-spots.json';

const sample = {
  material: 'steel',
  length_m: 3.6576,
  bustability: 3,
  removable: true,
  setup_options: [{ requires: [{ item: 'bungee', category: 'gear' }] }],
  custom_type: 'curved rail',
};

describe('formatLegacyDetails', () => {
  it('gives labelled rows in a fixed order, in Imperial units', () => {
    expect(formatLegacyDetails(sample, UnitSystem.Imperial)).toEqual([
      { label: 'Custom type', value: 'curved rail' },
      { label: 'Length', value: '12.0 ft' },
      { label: 'Material', value: 'steel' },
      { label: 'Removable', value: 'Yes' },
      { label: 'Bustability', value: '3/5' },
      { label: 'Setup options', value: '1 option: bungee' },
    ]);
  });

  it('gives the length in metres with Metric', () => {
    const rows = formatLegacyDetails(sample, UnitSystem.Metric);
    expect(rows.find((r) => r.label === 'Length')).toEqual({ label: 'Length', value: '3.7 m' });
  });

  it('humanises a key it has no label for', () => {
    expect(formatLegacyDetails({ stop_description: 'every 50 cm' }, UnitSystem.Imperial)).toEqual([
      { label: 'Stop description', value: 'every 50 cm' },
    ]);
    expect(formatLegacyDetails({ old_field_x: 'kept' }, UnitSystem.Imperial)).toEqual([
      { label: 'Old field x', value: 'kept' },
    ]);
  });

  it('gives no rows for an empty object', () => {
    expect(formatLegacyDetails({}, UnitSystem.Imperial)).toEqual([]);
  });

  it('formats the full migrated archive (M1 fixture) with every row readable', () => {
    expect(formatLegacyDetails(v2Spots.fullLegacy, UnitSystem.Metric)).toEqual([
      { label: 'Custom type', value: 'curved rail' },
      { label: 'Shape', value: 'kinked' },
      { label: 'Length', value: '12.5 m' },
      { label: 'Height', value: '1.2 m' },
      { label: 'Width', value: '0.1 m' },
      { label: 'Material', value: 'steel' },
      { label: 'Stop type', value: 'knobs' },
      { label: 'Stop description', value: 'every 50 cm' },
      { label: 'Removable', value: 'Yes' },
      { label: 'Difficulty', value: '3/5' },
      { label: 'Landing difficulty', value: '2/5' },
      { label: 'Landing surface', value: 'snow built' },
      { label: 'Intensity', value: '5/5' },
      { label: 'Bustability', value: '3/5' },
      { label: 'Bustability notes', value: 'security at 9pm' },
      { label: 'Setup options', value: '2 options: winch; drop in platform + 2 speed humps' },
    ]);
  });

  it('puts unknown keys after the known ones, in their stored order, and the raw columns last', () => {
    const rows = formatLegacyDetails(
      { raw_feature: '{not json', zeta_field: 'z', material: 'wood', alpha_field: 'a' },
      UnitSystem.Imperial,
    );
    expect(rows).toEqual([
      { label: 'Material', value: 'wood' },
      { label: 'Zeta field', value: 'z' },
      { label: 'Alpha field', value: 'a' },
      { label: 'Feature (unreadable)', value: '{not json' },
    ]);
  });

  it('skips empty values and never throws on odd ones', () => {
    const rows = formatLegacyDetails(
      {
        material: '  ',
        shape: null,
        setup_options: [],
        length_m: 'long',
        removable: false,
        extra: { a: 1 },
        count: 4,
      },
      UnitSystem.Imperial,
    );
    expect(rows).toEqual([
      { label: 'Length', value: 'long' },
      { label: 'Removable', value: 'No' },
      { label: 'Extra', value: '{"a":1}' },
      { label: 'Count', value: '4' },
    ]);
  });

  it('shows a setup option it cannot read as its stored JSON', () => {
    const rows = formatLegacyDetails({ setup_options: ['winch', { requires: [{ quantity: 2 }] }] }, UnitSystem.Imperial);
    expect(rows).toEqual([{ label: 'Setup options', value: '2 options: "winch"; {"requires":[{"quantity":2}]}' }]);
  });
});
