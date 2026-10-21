import { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react-native';
import { SpotTagFields, type SpotTags } from '@/src/components/SpotTagFields';
import { FEATURE_TYPE_LABELS } from '@/src/constants/labels';
import { FeatureType } from '@/src/types';

const EMPTY: SpotTags = { feature_types: [], stopped: false, natural_speed: undefined };

/** Holds the value like a screen would, so consecutive taps build on each other. */
function renderFields(initial: SpotTags = EMPTY) {
  const onChange = jest.fn();
  function Harness() {
    const [value, setValue] = useState(initial);
    return (
      <SpotTagFields
        value={value}
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
      />
    );
  }
  render(<Harness />);
  const last = () => onChange.mock.calls[onChange.mock.calls.length - 1][0] as SpotTags;
  return { onChange, last };
}

const chip = (label: string) => screen.getByRole('checkbox', { name: label });

describe('SpotTagFields', () => {
  it('keeps feature types in tap order and removes one on a second tap', () => {
    // D19: the first tapped type is the one the list label leads with ("Ledge +1").
    const { last } = renderFields();

    fireEvent.press(chip('Ledge'));
    fireEvent.press(chip('Rail'));
    expect(last().feature_types).toEqual([FeatureType.Ledge, FeatureType.Rail]);

    fireEvent.press(chip('Ledge'));
    expect(last().feature_types).toEqual([FeatureType.Rail]);
  });

  it('renders the eight chips in FEATURE_TYPE_LABELS order, checked when the value includes them', () => {
    renderFields({ ...EMPTY, feature_types: [FeatureType.Gap] });

    const chips = screen.getAllByRole('checkbox');
    expect(chips.map((c) => within(c).getByText(/./).props.children)).toEqual(Object.values(FEATURE_TYPE_LABELS));
    expect(chip('Gap').props.accessibilityState).toMatchObject({ checked: true });
    expect(chip('Rail').props.accessibilityState).toMatchObject({ checked: false });
  });

  it('sets stopped from the "Skate stopped" switch and passes the rest through', () => {
    const { last } = renderFields({ ...EMPTY, feature_types: [FeatureType.Rail], natural_speed: 1 });

    const toggle = screen.getByRole('switch', { name: 'Skate stopped' });
    expect(toggle.props.value).toBe(false);
    fireEvent(toggle, 'valueChange', true);

    expect(last()).toEqual({ feature_types: [FeatureType.Rail], stopped: true, natural_speed: 1 });
    expect(screen.getByText('Skate stopped', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('sets natural speed from the SpeedScale and clears it on a second tap', () => {
    const { last } = renderFields();

    fireEvent.press(screen.getByRole('radio', { name: /^Some:/ }));
    expect(last().natural_speed).toBe(2);

    fireEvent.press(screen.getByRole('radio', { name: /^Some:/ }));
    expect(last().natural_speed).toBeUndefined();
  });

  it('labels the chips "What\'s here" and the scale "Natural speed"', () => {
    renderFields();

    expect(screen.getByText("What's here")).toBeOnTheScreen();
    expect(screen.getByText('Natural speed')).toBeOnTheScreen();
  });

  it('has none of the old section words', () => {
    // The old edit form had a section skeleton; the rewrite has none (spec §2.2).
    renderFields({ feature_types: [FeatureType.Rail], stopped: true, natural_speed: 3 });

    for (const word of ['Feature', 'In-Run', 'Landing', 'Details', 'Status']) {
      expect(screen.queryByText(word)).toBeNull();
    }
  });
});
