import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSpotsStore } from '@/src/stores';
import { useSettingsStore } from '@/src/stores/settings-store';
import { UnitSystem } from '@/src/types';
import type { Dimensions, Spot, SpotUpdate } from '@/src/types';
import { createTestSpot } from './factories';

const mockUpdateSpot = jest.fn(async () => {});
jest.mock('@/src/hooks/use-spot-actions', () => ({
  useSpotActions: () => ({ updateSpot: mockUpdateSpot, addSpot: jest.fn(), removeSpot: jest.fn() }),
}));

import EditSpotScreen from '@/app/spot/[id]/edit';

const STORED: Dimensions = { length: 1.234, height: 0.456, width: 2 };
const FEET_PER_METER = 3.28084;

function renderEdit(spot: Spot) {
  useSpotsStore.setState({ spots: [spot] });
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: spot.id });
  render(<EditSpotScreen />);
}

// The dimension TextInputs are labelled "Length"/"Height"/"Width" for accessibility; these lookups use them.
const lengthInput = () => screen.getByLabelText('Length');

async function saveAndGetDimensions(): Promise<Dimensions | undefined> {
  fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(mockUpdateSpot).toHaveBeenCalledTimes(1));
  const updates = (mockUpdateSpot.mock.calls[0] as unknown as [string, SpotUpdate])[1];
  return updates.feature?.dimensions;
}

describe('Edit spot: dimensions', () => {
  beforeEach(() => {
    mockUpdateSpot.mockClear();
    useSettingsStore.setState({ units: UnitSystem.Metric });
  });

  it('saves the stored dimensions exactly when only the name is changed (metric)', async () => {
    // Regression: the one-decimal display text was parsed back on save, so 1.234 m became 1.2 m.
    renderEdit(createTestSpot({ name: 'Pier rail', feature: { dimensions: STORED } }));

    fireEvent.changeText(screen.getByDisplayValue('Pier rail'), 'Pier rail 2');

    const dims = await saveAndGetDimensions();
    expect(dims?.length).toBe(1.234);
    expect(dims?.height).toBe(0.456);
    expect(dims?.width).toBe(2);
  });

  it('saves the stored length exactly on an untouched save in imperial units', async () => {
    // Regression: metres -> feet (1 decimal) -> metres drifts on every save.
    useSettingsStore.setState({ units: UnitSystem.Imperial });
    renderEdit(createTestSpot({ name: 'Pier rail', feature: { dimensions: STORED } }));

    fireEvent.changeText(screen.getByDisplayValue('Pier rail'), 'Pier rail 2');

    const dims = await saveAndGetDimensions();
    expect(dims?.length).toBe(1.234);
    expect(dims?.height).toBe(0.456);
    expect(dims?.width).toBe(2);
  });

  it('saves a changed length as typed and leaves the other dimensions alone (metric)', async () => {
    // Guard: editing one field must not disturb the untouched ones.
    renderEdit(createTestSpot({ feature: { dimensions: STORED } }));

    fireEvent.changeText(lengthInput(), '2.5');

    const dims = await saveAndGetDimensions();
    expect(dims?.length).toBe(2.5);
    expect(dims?.height).toBe(0.456);
    expect(dims?.width).toBe(2);
  });

  it('converts a changed length from feet to metres on save (imperial)', async () => {
    // Guard: typed values are in the user's units and are stored in metres.
    useSettingsStore.setState({ units: UnitSystem.Imperial });
    renderEdit(createTestSpot({ feature: { dimensions: STORED } }));

    fireEvent.changeText(lengthInput(), '10');

    const dims = await saveAndGetDimensions();
    expect(dims?.length).toBeCloseTo(10 / FEET_PER_METER, 6);
    expect(dims?.height).toBe(0.456);
    expect(dims?.width).toBe(2);
  });

  it('accepts a comma decimal such as "1,5" (iPhone decimal pad in many locales)', async () => {
    // Regression: parseFloat("1,5") truncates to 1.
    renderEdit(createTestSpot({ feature: { dimensions: STORED } }));

    fireEvent.changeText(lengthInput(), '1,5');

    const dims = await saveAndGetDimensions();
    expect(dims?.length).toBe(1.5);
  });

  it('removes the length when the field is cleared and keeps the others', async () => {
    // Guard: an empty field means "no dimension", not 0 or the old value.
    renderEdit(createTestSpot({ feature: { dimensions: STORED } }));

    fireEvent.changeText(lengthInput(), '');

    const dims = await saveAndGetDimensions();
    expect(dims?.length).toBeUndefined();
    expect(dims?.height).toBe(0.456);
    expect(dims?.width).toBe(2);
  });

  it.each(['abc', '-2'])(
    'keeps the stored length and never saves NaN when "%s" is typed',
    async (text) => {
      // Regression: parseFloat of non-numbers gave NaN; negative sizes are not valid either.
      renderEdit(createTestSpot({ feature: { dimensions: STORED } }));

      fireEvent.changeText(lengthInput(), text);

      const dims = await saveAndGetDimensions();
      expect(Number.isNaN(dims?.length)).toBe(false);
      expect(dims?.length).toBe(1.234);
    },
  );

  it('removes the length when "0" is typed and keeps the others', async () => {
    // The placeholder is "0", so a user typing 0 means "no length"; it must not silently keep the old value.
    renderEdit(createTestSpot({ feature: { dimensions: STORED } }));

    fireEvent.changeText(lengthInput(), '0');

    const dims = await saveAndGetDimensions();
    expect(dims?.length).toBeUndefined();
    expect(dims?.height).toBe(0.456);
    expect(dims?.width).toBe(2);
  });

  it('saves an undefined width when there was none and the user types "abc"', async () => {
    // Regression: invalid text on a previously empty field stored NaN instead of nothing.
    renderEdit(createTestSpot({ feature: { dimensions: { length: 1.234 } } }));

    fireEvent.changeText(screen.getByLabelText('Width'), 'abc');

    const dims = await saveAndGetDimensions();
    expect(dims?.width).toBeUndefined();
  });
});
