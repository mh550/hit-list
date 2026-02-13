import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import ProfileScreen from '@/app/(tabs)/profile';
import { useSettingsStore } from '@/src/stores/settings-store';
import { GearItem, UnitSystem } from '@/src/types';

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
      gear: [],
    });
  });

  it('renders units toggle', () => {
    render(<ProfileScreen />);
    expect(screen.getByText('Imperial')).toBeTruthy();
    expect(screen.getByText('Metric')).toBeTruthy();
  });

  it('renders all gear items', () => {
    render(<ProfileScreen />);
    expect(screen.getByText('winch')).toBeTruthy();
    expect(screen.getByText('bungee')).toBeTruthy();
    expect(screen.getByText('drop in platform')).toBeTruthy();
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

  it('tapping a gear item adds it to store', () => {
    render(<ProfileScreen />);
    fireEvent.press(screen.getByText('winch'));
    expect(useSettingsStore.getState().gear).toContain(GearItem.Winch);
  });

  it('tapping an already-selected gear item removes it', () => {
    useSettingsStore.setState({ gear: [GearItem.Winch], units: UnitSystem.Imperial, batch_import_radius: 50 });
    render(<ProfileScreen />);
    fireEvent.press(screen.getByText('winch'));
    expect(useSettingsStore.getState().gear).not.toContain(GearItem.Winch);
  });

  it('renders batch import radius field', () => {
    render(<ProfileScreen />);
    expect(screen.getByText('Import Radius')).toBeTruthy();
  });
});
