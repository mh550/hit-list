import { act, render, screen, fireEvent } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerAsset, ImagePickerResult } from 'expo-image-picker';
import { useSettingsStore } from '@/src/stores/settings-store';
import { groupPhotosByProximity } from '@/src/utils/import-clustering';
import { UnitSystem } from '@/src/types';

// Member names from node_modules/expo-image-picker/build/ImagePicker.d.ts.
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('@/src/utils/import-clustering', () => {
  const actual = jest.requireActual('@/src/utils/import-clustering');
  return { ...actual, groupPhotosByProximity: jest.fn(actual.groupPhotosByProximity) };
});

import ImportScreen from '@/app/import';

const ASSET: ImagePickerAsset = {
  uri: 'file:///picked/a.jpg',
  width: 4032,
  height: 3024,
  exif: { GPSLatitude: 47.6, GPSLatitudeRef: 'N', GPSLongitude: 122.3, GPSLongitudeRef: 'W' },
};

describe('ImportScreen radius text (D23)', () => {
  beforeEach(() => {
    useSettingsStore.setState({ units: UnitSystem.Imperial, batch_import_radius: 50 });
  });

  it('shows the 50 m default in feet for Imperial', () => {
    render(<ImportScreen />);
    expect(screen.getByText(/\(within 164 ft\)/)).toBeTruthy();
  });

  it('shows it in metres for Metric', () => {
    useSettingsStore.setState({ units: UnitSystem.Metric });
    render(<ImportScreen />);
    expect(screen.getByText(/\(within 50 m\)/)).toBeTruthy();
  });

  it('still groups the picked photos by the radius in metres', async () => {
    const picked: ImagePickerResult = { canceled: false, assets: [ASSET] };
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(picked);
    render(<ImportScreen />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button'));
    });
    expect(groupPhotosByProximity).toHaveBeenCalledWith(expect.any(Array), 50);
  });
});
