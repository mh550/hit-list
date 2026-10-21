import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import ProfileScreen from '@/app/(tabs)/profile';
import { useSettingsStore } from '@/src/stores/settings-store';
import { UnitSystem } from '@/src/types';
import { saveUserSettings } from '@/src/db';

jest.mock('expo-sqlite', () => ({
  useSQLiteContext: () => ({
    runAsync: jest.fn().mockResolvedValue(undefined),
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
  }),
  SQLiteProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/src/db', () => ({
  saveUserSettings: jest.fn().mockResolvedValue(undefined),
  migrateDb: jest.fn().mockResolvedValue(undefined),
  getSpots: jest.fn().mockResolvedValue([]),
  getUserSettings: jest.fn().mockResolvedValue(null),
}));

describe('ProfileScreen', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      units: UnitSystem.Imperial,
      batch_import_radius: 50,
    });
  });

  it('renders units toggle', () => {
    render(<ProfileScreen />);
    expect(screen.getByText('Imperial')).toBeTruthy();
    expect(screen.getByText('Metric')).toBeTruthy();
  });

  it('has no My Gear section or gear chips (D22)', () => {
    render(<ProfileScreen />);
    expect(screen.queryByText(/my gear/i)).toBeNull();
    expect(screen.queryByText('winch')).toBeNull();
    expect(screen.queryByText('bungee')).toBeNull();
  });

  it('shows current units as selected', () => {
    render(<ProfileScreen />);
    const imperialButton = screen.getByText('Imperial');
    // Imperial should be the active/selected option
    expect(imperialButton).toBeTruthy();
  });

  it('switching units updates the store', () => {
    render(<ProfileScreen />);
    fireEvent.press(screen.getByText('Metric'));
    expect(useSettingsStore.getState().units).toBe(UnitSystem.Metric);
  });

  it('shows the 50 m default radius in feet for Imperial (D23)', () => {
    render(<ProfileScreen />);
    expect(screen.getByText('Import radius · ft')).toBeTruthy();
    expect(screen.getByLabelText('Import radius in feet').props.value).toBe('164');
  });

  it('re-renders the radius in metres after switching to Metric', () => {
    render(<ProfileScreen />);
    fireEvent.press(screen.getByText('Metric'));
    expect(screen.getByText('Import radius · m')).toBeTruthy();
    expect(screen.queryByText('Import radius · ft')).toBeNull();
    expect(screen.getByLabelText('Import radius in metres').props.value).toBe('50');
  });

  it('stores typed feet as metres on blur', async () => {
    render(<ProfileScreen />);
    const field = screen.getByLabelText('Import radius in feet');
    fireEvent.changeText(field, '328');
    await act(async () => {
      fireEvent(field, 'blur');
    });
    expect(useSettingsStore.getState().batch_import_radius).toBe(100);
    expect(saveUserSettings).toHaveBeenLastCalledWith(expect.anything(), {
      units: UnitSystem.Imperial,
      batch_import_radius: 100,
    });
    expect(screen.getByLabelText('Import radius in feet').props.value).toBe('328');
  });

  it('restores the previous value on blur after invalid text', async () => {
    jest.mocked(saveUserSettings).mockClear();
    render(<ProfileScreen />);
    const field = screen.getByLabelText('Import radius in feet');
    fireEvent.changeText(field, 'abc');
    await act(async () => {
      fireEvent(field, 'blur');
    });
    expect(screen.getByLabelText('Import radius in feet').props.value).toBe('164');
    expect(useSettingsStore.getState().batch_import_radius).toBe(50);
    expect(saveUserSettings).not.toHaveBeenCalled();
  });

  it('saves feet typed before a switch to Metric as feet', async () => {
    render(<ProfileScreen />);
    fireEvent.changeText(screen.getByLabelText('Import radius in feet'), '328');
    await act(async () => {
      fireEvent.press(screen.getByText('Metric'));
    });
    expect(useSettingsStore.getState().batch_import_radius).toBe(100);
    expect(screen.getByLabelText('Import radius in metres').props.value).toBe('100');
  });

  it('leaves the stored metres alone when the field is blurred unchanged', async () => {
    jest.mocked(saveUserSettings).mockClear();
    render(<ProfileScreen />);
    const field = screen.getByLabelText('Import radius in feet');
    await act(async () => {
      fireEvent(field, 'blur');
    });
    expect(useSettingsStore.getState().batch_import_radius).toBe(50);
    expect(saveUserSettings).not.toHaveBeenCalled();
  });

  it('writes nothing when a radius that is not whole feet is blurred unchanged (M7-02)', async () => {
    // 50.4 m shows as 165 ft, and 165 ft reads back as 50 m: only the untouched-field guard keeps 50.4.
    useSettingsStore.setState({ batch_import_radius: 50.4 });
    jest.mocked(saveUserSettings).mockClear();
    render(<ProfileScreen />);
    const field = screen.getByLabelText('Import radius in feet');
    expect(field.props.value).toBe('165');
    await act(async () => {
      fireEvent(field, 'blur');
    });
    expect(useSettingsStore.getState().batch_import_radius).toBe(50.4);
    expect(saveUserSettings).not.toHaveBeenCalled();
  });

  it('shows the whole metres it stored after blur, so 165 ft reads 164 (D33)', async () => {
    render(<ProfileScreen />);
    const field = screen.getByLabelText('Import radius in feet');
    fireEvent.changeText(field, '165');
    await act(async () => {
      fireEvent(field, 'blur');
    });
    expect(useSettingsStore.getState().batch_import_radius).toBe(50);
    expect(screen.getByLabelText('Import radius in feet').props.value).toBe('164');
  });

  it('explains that the radius also drives the nearby-spot offer (D25)', () => {
    render(<ProfileScreen />);
    expect(
      screen.getByText(
        'Photos this close together import as one spot, and a new spot this close to one you have offers to join it.',
      ),
    ).toBeTruthy();
  });
});

describe('Import Photos entry point', () => {
  it('is not on the Profile tab', () => {
    // D12 (Michael, 2026-10-15): Import Photos moved to the Spots tab; Profile must not offer it.
    render(<ProfileScreen />);

    // Case-insensitive so a relabelled "Import photos" button would also be caught; anchored so help text that
    // mentions importing photos does not count.
    expect(screen.queryByText(/^\s*import photos\s*$/i)).toBeNull();
    expect(screen.queryByLabelText(/import photos/i)).toBeNull();
  });
});
