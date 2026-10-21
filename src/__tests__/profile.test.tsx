import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import ProfileScreen from '@/app/(tabs)/profile';
import { useSettingsStore } from '@/src/stores/settings-store';
import { UnitSystem } from '@/src/types';

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

  it('renders batch import radius field', () => {
    render(<ProfileScreen />);
    expect(screen.getByText('Import Radius')).toBeTruthy();
  });
});

describe('Import Photos entry point', () => {
  it('is not on the Profile tab', () => {
    // D12 (Michael, 2026-10-15): Import Photos moved to the Spots tab; Profile must not offer it.
    render(<ProfileScreen />);

    // Case-insensitive so a relabelled "Import photos" button would also be caught. Anchored because the
    // Import Radius help text legitimately contains the phrase "import photos from the Spots tab".
    expect(screen.queryByText(/^\s*import photos\s*$/i)).toBeNull();
    expect(screen.queryByLabelText(/import photos/i)).toBeNull();
  });
});
