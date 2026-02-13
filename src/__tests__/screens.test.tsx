import React from 'react';
import { render, screen } from '@testing-library/react-native';

// Mock FlashList
jest.mock('@shopify/flash-list', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { FlatList } = require('react-native');
  return { FlashList: FlatList };
});

// Mock expo-image
jest.mock('expo-image', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Image } = require('react-native');
  return { Image };
});

// Mock IconSymbol
jest.mock('@/components/ui/icon-symbol', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    IconSymbol: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

// Mock expo-sqlite
jest.mock('expo-sqlite', () => ({
  useSQLiteContext: () => ({
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue(undefined),
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
  }),
  SQLiteProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock expo-image-picker
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true, assets: [] }),
  MediaTypeOptions: { Images: 'Images' },
}));

// Mock expo-camera
jest.mock('expo-camera', () => ({
  CameraView: 'CameraView',
  useCameraPermissions: () => [{ granted: false }, jest.fn()],
}));

// Mock expo-location
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
  getCurrentPositionAsync: jest.fn(),
}));

import SpotsScreen from '@/app/(tabs)/index';
import ProfileScreen from '@/app/(tabs)/profile';
import CameraScreen from '@/app/add/camera';
import ReviewScreen from '@/app/add/review';
import ImportScreen from '@/app/import/index';
import ImportReviewScreen from '@/app/import/review';

describe('Screen smoke tests', () => {
  it('renders Spots screen with empty state', () => {
    render(<SpotsScreen />);
    expect(screen.getByText('No Spots Yet')).toBeTruthy();
  });

  it('renders Profile screen', () => {
    render(<ProfileScreen />);
    expect(screen.getByText('Units')).toBeTruthy();
    expect(screen.getByText('My Gear')).toBeTruthy();
  });

  it('renders Camera screen (permission request state)', () => {
    render(<CameraScreen />);
    expect(screen.getByText('Camera permission required')).toBeTruthy();
  });

  it('renders Review screen', () => {
    render(<ReviewScreen />);
    expect(screen.getByText('Save as Draft')).toBeTruthy();
  });

  it('renders Import screen', () => {
    render(<ImportScreen />);
    expect(screen.getByText('Import Photos')).toBeTruthy();
  });

  it('renders Import Review screen (empty state)', () => {
    render(<ImportReviewScreen />);
    expect(screen.getByText('No photo groups to import.')).toBeTruthy();
  });

  it('Spots screen has FAB add button', () => {
    render(<SpotsScreen />);
    expect(screen.getByLabelText('Add new spot')).toBeTruthy();
  });
});
