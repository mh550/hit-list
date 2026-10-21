import { ScrollView } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMediaStore, useSpotsStore } from '@/src/stores';
import { FeatureType } from '@/src/types';
import type { Spot, SpotUpdate } from '@/src/types';
import { createTestMedia, createTestSpot } from './factories';

const mockUpdateSpot = jest.fn(async () => {});
jest.mock('@/src/hooks/use-spot-actions', () => ({
  useSpotActions: () => ({ updateSpot: mockUpdateSpot, addSpot: jest.fn(), removeSpot: jest.fn() }),
}));
jest.mock('@/src/hooks/use-media-actions', () => ({
  useMediaActions: () => ({ removePhotos: jest.fn(async (ids: string[]) => ids), savePhotos: jest.fn() }),
}));

import EditSpotScreen from '@/app/spot/[id]/edit';

function renderEdit(spot: Spot, photoCount = 0) {
  const media = Array.from({ length: photoCount }, (_, i) => createTestMedia({ id: `m${i + 1}`, spot_id: spot.id }));
  useSpotsStore.setState({ spots: [spot] });
  useMediaStore.setState({ mediaBySpot: media.length ? { [spot.id]: media } : {} });
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: spot.id });
  render(<EditSpotScreen />);
}

async function save() {
  const saveButton = screen.getByRole('button', { name: 'Save' });
  expect(saveButton).toBeEnabled();
  fireEvent.press(saveButton);
  await waitFor(() => expect(mockUpdateSpot).toHaveBeenCalledTimes(1));
  const [id, patch] = mockUpdateSpot.mock.calls[0] as unknown as [string, SpotUpdate];
  return { id, patch };
}

const tagged = () =>
  createTestSpot({
    id: 's1',
    feature_types: [FeatureType.Rail],
    stopped: true,
    natural_speed: 2,
    notes: 'n',
  });

describe('Edit spot: tags and notes', () => {
  beforeEach(() => {
    mockUpdateSpot.mockClear();
    jest.mocked(useRouter).mockReturnValue({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() } as never);
  });

  it('pre-fills the chips, the switch, the speed and the notes from the spot', () => {
    renderEdit(tagged());

    expect(screen.getByRole('checkbox', { name: 'Rail' }).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByRole('checkbox', { name: 'Ledge' }).props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByRole('switch', { name: 'Skate stopped' }).props.value).toBe(true);
    expect(screen.getByRole('radio', { name: /^Some:/ }).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByLabelText('Notes').props.value).toBe('n');
  });

  it('saves feature_types in tap order, stopped, natural_speed and notes', async () => {
    renderEdit(tagged());

    fireEvent.press(screen.getByRole('checkbox', { name: 'Ledge' }));
    fireEvent(screen.getByRole('switch', { name: 'Skate stopped' }), 'valueChange', false);
    fireEvent.press(screen.getByRole('radio', { name: /^Enough:/ }));
    fireEvent.changeText(screen.getByLabelText('Notes'), 'new notes');
    const { id, patch } = await save();

    expect(id).toBe('s1');
    expect(patch).toMatchObject({
      feature_types: [FeatureType.Rail, FeatureType.Ledge],
      stopped: false,
      natural_speed: 3,
      notes: 'new notes',
    });
  });

  it('keeps tap order when the tapped chip comes earlier in the label list', async () => {
    // Rail is listed before Ledge, so a spot tagged Ledge that gains Rail must save ['ledge','rail'], not a sorted list.
    renderEdit(createTestSpot({ id: 's1', feature_types: [FeatureType.Ledge] }));

    fireEvent.press(screen.getByRole('checkbox', { name: 'Rail' }));
    const { patch } = await save();

    expect(patch.feature_types).toEqual([FeatureType.Ledge, FeatureType.Rail]);
  });

  it('lifts the form above the keyboard so Notes stays visible while typing', () => {
    // Notes sits near the bottom of a long form; without keyboard insets the iOS keyboard covers it.
    renderEdit(tagged());

    expect(screen.UNSAFE_getByType(ScrollView).props.automaticallyAdjustKeyboardInsets).toBe(true);
  });

  it('gives VoiceOver one stop per control: the visible "Skate stopped" and "Notes" labels are hidden', () => {
    // The Switch and the input carry the same label; a second stop on the plain Text only repeats it.
    renderEdit(tagged());

    for (const label of ['Skate stopped', 'Notes']) {
      expect(screen.queryByText(label)).toBeNull(); // RNTL's default query skips hidden elements
      const text = screen.getByText(label, { includeHiddenElements: true });
      expect(text.props.accessibilityElementsHidden).toBe(true);
      expect(text.props.importantForAccessibility).toBe('no');
    }
  });

  it('saves notes: null when the notes field is cleared', async () => {
    // undefined would keep the stored notes; null clears the column.
    renderEdit(tagged());

    fireEvent.changeText(screen.getByLabelText('Notes'), '  ');
    const { patch } = await save();

    expect(patch).toHaveProperty('notes', null);
  });

  it('saves natural_speed: null when the selected speed is tapped again', async () => {
    renderEdit(tagged());

    fireEvent.press(screen.getByRole('radio', { name: /^Some:/ }));
    expect(screen.getByText('Not rated')).toBeOnTheScreen();
    const { patch } = await save();

    expect(patch).toHaveProperty('natural_speed', null);
  });

  it('keeps natural_speed 0 (None) as a real value', async () => {
    renderEdit(createTestSpot({ id: 's1', natural_speed: 0 }));

    expect(screen.getByRole('radio', { name: /^None:/ }).props.accessibilityState).toMatchObject({ checked: true });
    const { patch } = await save();

    expect(patch).toHaveProperty('natural_speed', 0);
  });

  it('enables Save with every control empty and writes the empty values', async () => {
    renderEdit(createTestSpot({ id: 's1' }));

    const { patch } = await save();

    expect(patch).toMatchObject({ name: null, feature_types: [], stopped: false, natural_speed: null, notes: null });
    expect(patch).not.toHaveProperty('location');
  });

  it('shows the §2.2 fields and none of the old form', () => {
    renderEdit(tagged(), 3);

    expect(screen.getByPlaceholderText('Name (optional)')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Anything else')).toBeOnTheScreen();
    expect(screen.getByText('Delete spot')).toBeOnTheScreen();
    for (const word of [
      'Basic Info',
      'Feature',
      'In-Run',
      'Landing',
      'Details',
      'Status',
      'Save as Draft',
      'Material',
      'Shape',
      'Length',
      'Bustability',
      'Intensity',
      'Photos',
      'Delete Spot',
    ]) {
      expect(screen.queryByText(word)).toBeNull();
    }
  });

  it('shows the photos in a PhotoGrid with a "Remove photo N" button per tile', () => {
    renderEdit(tagged(), 3);

    expect(screen.getByTestId('photo-tile-0')).toBeOnTheScreen();
    expect(screen.getByTestId('photo-tile-2')).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: /^Remove photo \d+$/ }).map((b) => b.props.accessibilityLabel)).toEqual([
      'Remove photo 1',
      'Remove photo 2',
      'Remove photo 3',
    ]);
  });
});
