import { Linking } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { useCameraPermissions } from 'expo-camera';
import type { PermissionResponse } from 'expo-camera';

// Shapes copied from node_modules/expo-camera/build/index.d.ts (useCameraPermissions) and
// expo-modules-core PermissionsInterface.d.ts (PermissionResponse).
jest.mock('expo-camera', () => ({
  CameraView: 'CameraView',
  useCameraPermissions: jest.fn(),
}));

import CameraScreen from '@/app/add/camera';

const denied = (canAskAgain: boolean): PermissionResponse =>
  ({ status: 'denied', granted: false, canAskAgain, expires: 'never' }) as PermissionResponse;

describe('Camera screen without permission', () => {
  const back = jest.fn();
  const requestPermission = jest.fn(async () => denied(true));
  const getPermission = jest.fn(async () => denied(true));

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useRouter).mockReturnValue({ push: jest.fn(), back, replace: jest.fn() } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lets the user close the screen while permission is still loading', () => {
    // The screen has no header, so "Loading camera..." is a dead end without its own Close control.
    jest.mocked(useCameraPermissions).mockReturnValue([null, requestPermission, getPermission]);

    render(<CameraScreen />);
    fireEvent.press(screen.getByText('Close'));

    expect(back).toHaveBeenCalledTimes(1);
  });

  it('offers Grant Permission and Close when denial can still be re-asked', () => {
    // First denial on iOS can be re-asked; the user must also be able to leave instead.
    jest.mocked(useCameraPermissions).mockReturnValue([denied(true), requestPermission, getPermission]);

    render(<CameraScreen />);
    fireEvent.press(screen.getByText('Grant Permission'));
    expect(requestPermission).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByText('Close'));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('offers Open Settings instead of Grant Permission once iOS will not prompt again', () => {
    // After a second denial requestPermission does nothing, so the only way forward is the Settings app.
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    jest.mocked(useCameraPermissions).mockReturnValue([denied(false), requestPermission, getPermission]);

    render(<CameraScreen />);

    expect(screen.queryByText('Grant Permission')).toBeNull();
    fireEvent.press(screen.getByText('Open Settings'));
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(requestPermission).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Close'));
    expect(back).toHaveBeenCalledTimes(1);
  });
});
