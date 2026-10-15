import { StyleSheet } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSpotsStore } from '@/src/stores';
import { StopType } from '@/src/types';
import type { Spot, SpotUpdate } from '@/src/types';
import { createTestSpot } from './factories';

const mockUpdateSpot = jest.fn(async () => {});
jest.mock('@/src/hooks/use-spot-actions', () => ({
  useSpotActions: () => ({ updateSpot: mockUpdateSpot, addSpot: jest.fn(), removeSpot: jest.fn() }),
}));

import EditSpotScreen from '@/app/spot/[id]/edit';

const EXISTING_STOPS = {
  is_stopped: true,
  stop_type: StopType.Knobs,
  stop_description: 'Knobbed at kinks',
  removable: false,
};

function renderEdit(spot: Spot) {
  useSpotsStore.setState({ spots: [spot] });
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: spot.id });
  render(<EditSpotScreen />);
}

const stopsSwitch = () => screen.getByLabelText('Skate stops');
const chip = (name: string) => screen.getByRole('checkbox', { name });
const turnStopsOn = () => fireEvent(stopsSwitch(), 'valueChange', true);
const turnStopsOff = () => fireEvent(stopsSwitch(), 'valueChange', false);

async function saveAndGetUpdates(): Promise<SpotUpdate> {
  fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(mockUpdateSpot).toHaveBeenCalledTimes(1));
  return (mockUpdateSpot.mock.calls[0] as unknown as [string, SpotUpdate])[1];
}

describe('Edit spot: skate stops', () => {
  beforeEach(() => {
    mockUpdateSpot.mockClear();
  });

  it('hides the stop fields while the switch is off and shows them once it is turned on', () => {
    // The details only make sense for a stopped feature, so they must not clutter the form until asked for.
    renderEdit(createTestSpot());

    expect(stopsSwitch().props.value).toBe(false);
    expect(screen.queryByRole('checkbox', { name: 'Knobs' })).toBeNull();
    expect(screen.queryByLabelText('Stop details')).toBeNull();
    expect(screen.queryByLabelText('Removable with tools')).toBeNull();

    turnStopsOn();

    for (const label of ['Knobs', 'Caps', 'Brackets', 'Welds', 'Other']) {
      expect(chip(label)).toBeOnTheScreen();
    }
    expect(screen.getByLabelText('Stop details')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Knobbed at kinks')).toBeOnTheScreen();
    expect(screen.getByLabelText('Removable with tools')).toBeOnTheScreen();
  });

  it('saves is_stopped, type, trimmed details and removable when the switch is on with everything filled in', async () => {
    // The core feature: what the user picked ends up in the feature that is written to the spot.
    renderEdit(createTestSpot());

    turnStopsOn();
    fireEvent.press(chip('Welds'));
    fireEvent.changeText(screen.getByLabelText('Stop details'), '  Welded at the lip  ');
    fireEvent(screen.getByLabelText('Removable with tools'), 'valueChange', true);

    const updates = await saveAndGetUpdates();
    expect(updates.feature?.skate_stops).toEqual({
      is_stopped: true,
      stop_type: StopType.Welds,
      stop_description: 'Welded at the lip',
      removable: true,
    });
  });

  it('saves only is_stopped and removable: false when the switch is on and nothing else is chosen', async () => {
    // Empty details and no chip must be omitted (undefined), not stored as '' or a default type.
    // Matcher: toEqual, which treats an undefined property the same as a missing one (toStrictEqual would not).
    renderEdit(createTestSpot());

    turnStopsOn();

    const updates = await saveAndGetUpdates();
    expect(updates.feature?.skate_stops).toEqual({
      is_stopped: true,
      stop_type: undefined,
      stop_description: undefined,
      removable: false,
    });
  });

  it('saves skate_stops as undefined when the switch is off', async () => {
    // A spot nobody marked stays "unknown"; off must not write is_stopped: false.
    renderEdit(createTestSpot());

    const updates = await saveAndGetUpdates();
    expect(updates.feature?.skate_stops).toBeUndefined();
  });

  it('opens a spot that already has skate stops with the switch on and the stored values filled in', () => {
    // Editing must start from what is stored, not from a blank form.
    renderEdit(createTestSpot({ feature: { skate_stops: EXISTING_STOPS } }));

    expect(stopsSwitch().props.value).toBe(true);
    expect(chip('Knobs')).toBeChecked();
    expect(chip('Caps')).not.toBeChecked();
    expect(screen.getByLabelText('Stop details').props.value).toBe('Knobbed at kinks');
    expect(screen.getByLabelText('Removable with tools').props.value).toBe(false);
  });

  it('keeps existing skate_stops when an unrelated field (the name) is edited and saved', async () => {
    // Regression: handleSave rebuilt `feature` without skate_stops, so any save wiped existing stop data.
    renderEdit(createTestSpot({ name: 'Pier 57 rail', feature: { skate_stops: EXISTING_STOPS } }));

    fireEvent.changeText(screen.getByDisplayValue('Pier 57 rail'), 'Pier 57 kinked rail');

    const updates = await saveAndGetUpdates();
    expect(updates.name).toBe('Pier 57 kinked rail');
    expect(updates.feature?.skate_stops).toEqual(EXISTING_STOPS);
  });

  it('keeps the chosen chip and typed details when the switch is turned off and on again', async () => {
    // Toggling is not destructive within one edit; only Save drops the data of an off switch.
    renderEdit(createTestSpot());

    turnStopsOn();
    fireEvent.press(chip('Brackets'));
    fireEvent.changeText(screen.getByLabelText('Stop details'), 'Bolted every 2m');
    turnStopsOff();
    turnStopsOn();

    expect(chip('Brackets')).toBeChecked();
    expect(screen.getByLabelText('Stop details').props.value).toBe('Bolted every 2m');

    const updates = await saveAndGetUpdates();
    expect(updates.feature?.skate_stops).toEqual({
      is_stopped: true,
      stop_type: StopType.Brackets,
      stop_description: 'Bolted every 2m',
      removable: false,
    });
  });

  it('clears the stop type when the selected chip is tapped again', async () => {
    // Same tap-again-to-clear behavior as the Type and Material chips; a type is optional.
    renderEdit(createTestSpot({ feature: { skate_stops: EXISTING_STOPS } }));

    expect(chip('Knobs')).toBeChecked();
    fireEvent.press(chip('Knobs'));
    expect(chip('Knobs')).not.toBeChecked();

    const updates = await saveAndGetUpdates();
    expect(updates.feature?.skate_stops).toEqual({
      is_stopped: true,
      stop_type: undefined,
      stop_description: 'Knobbed at kinks',
      removable: false,
    });
  });

  it.each(['Skate stops', 'Removable with tools'])(
    'hides the visible "%s" label from VoiceOver so the switch row is read once',
    (label) => {
      // The Switch already carries accessibilityLabel; the visible Text beside it would be read a second time.
      renderEdit(createTestSpot({ feature: { skate_stops: EXISTING_STOPS } }));

      const text = screen.getByText(label, { includeHiddenElements: true });
      expect(text.props.accessibilityElementsHidden).toBe(true); // iOS
      expect(text.props.importantForAccessibility).toBe('no'); // Android
    },
  );

  it.each(['Skate stops', 'Removable with tools'])(
    'lets the "%s" label shrink so a long label at large text sizes cannot push the switch off-screen',
    (label) => {
      // Without flexShrink the label keeps its full width and the Switch is squeezed out of the row.
      renderEdit(createTestSpot({ feature: { skate_stops: EXISTING_STOPS } }));

      expect(StyleSheet.flatten(screen.getByText(label, { includeHiddenElements: true }).props.style).flexShrink).toBe(1);
    },
  );
});
