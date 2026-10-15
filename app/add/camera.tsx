import { useCallback, useRef, useState, useEffect } from 'react';
import { StyleSheet, View, Text, Pressable, ScrollView, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Image } from 'expo-image';

import { useLocationStore } from '@/src/stores/location-store';
import { palette, spacing, radius } from '@/src/constants/theme';
import type { GeoPoint } from '@/src/types';
import { toGeoPoint } from '@/src/utils/geo';

interface CapturedPhoto {
  uri: string;
  location?: GeoPoint;
}

export default function CameraScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [capturedLocation, setCapturedLocation] = useState<GeoPoint | null>(null);
  const setCurrentLocation = useLocationStore((s) => s.setCurrentLocation);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const point = toGeoPoint(await Location.getCurrentPositionAsync({}));
        setCapturedLocation(point);
        setCurrentLocation(point);
      }
    })();
  }, [setCurrentLocation]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync();
    if (photo) {
      setPhotos((prev) => [...prev, { uri: photo.uri, location: capturedLocation ?? undefined }]);
    }
  }, [capturedLocation]);

  const handleDone = useCallback(() => {
    if (photos.length === 0) {
      router.back();
      return;
    }
    // Pass photos via params (serialized URIs)
    router.push({
      pathname: '/add/review',
      params: {
        photoUris: photos.map((p) => p.uri).join(','),
        latitude: capturedLocation?.latitude?.toString() ?? '',
        longitude: capturedLocation?.longitude?.toString() ?? '',
      },
    });
  }, [photos, capturedLocation, router]);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  // The screen has no header, so both permission states carry their own Close (router.back).
  const closePermissionButton = (
    <Pressable
      style={styles.permCloseButton}
      onPress={handleClose}
      hitSlop={12}
      accessibilityRole="button">
      <Text style={styles.closeButton}>Close</Text>
    </Pressable>
  );

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>Loading camera...</Text>
        {closePermissionButton}
      </View>
    );
  }

  if (!permission.granted) {
    // Once iOS has been declined it never prompts again; only the Settings app can grant it then.
    const canAsk = permission.canAskAgain !== false;
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>Camera permission required</Text>
        {canAsk ? (
          <Pressable style={styles.permButton} onPress={requestPermission} accessibilityRole="button">
            <Text style={styles.permButtonText}>Grant Permission</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.permButton}
            onPress={() => Linking.openSettings()}
            accessibilityRole="button">
            <Text style={styles.permButtonText}>Open Settings</Text>
          </Pressable>
        )}
        {closePermissionButton}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Text style={styles.closeButton}>Close</Text>
          </Pressable>
          <Text style={styles.photoCount}>
            {photos.length > 0 ? `${photos.length} photo${photos.length > 1 ? 's' : ''}` : ''}
          </Text>
          <Pressable onPress={handleDone} hitSlop={12}>
            <Text style={styles.doneButton}>
              {photos.length > 0 ? 'Done' : ''}
            </Text>
          </Pressable>
        </View>

        {/* Bottom controls */}
        <View style={styles.bottomBar}>
          {/* Photo strip */}
          {photos.length > 0 ? (
            <ScrollView horizontal style={styles.photoStrip} showsHorizontalScrollIndicator={false}>
              {photos.map((photo, i) => (
                <Image
                  key={i}
                  source={{ uri: photo.uri }}
                  style={styles.photoThumb}
                  contentFit="cover"
                />
              ))}
            </ScrollView>
          ) : null}

          {/* Capture button */}
          <View style={styles.captureRow}>
            <Pressable
              onPress={handleCapture}
              style={({ pressed }) => [styles.captureButton, pressed && styles.capturePressed]}
              accessibilityLabel="Take photo"
              accessibilityRole="button">
              <View style={styles.captureInner} />
            </Pressable>
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.black,
    justifyContent: 'center',
    alignItems: 'center',
  },
  camera: {
    flex: 1,
    width: '100%',
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing['3xl'],
    paddingBottom: spacing.sm,
  },
  closeButton: {
    color: palette.white,
    fontSize: 17,
    fontWeight: '600',
  },
  photoCount: {
    color: palette.white,
    fontSize: 15,
    fontWeight: '500',
  },
  doneButton: {
    color: palette.yellow[500],
    fontSize: 17,
    fontWeight: '700',
  },
  bottomBar: {
    paddingBottom: spacing['3xl'],
    gap: spacing.md,
  },
  photoStrip: {
    paddingHorizontal: spacing.lg,
    maxHeight: 64,
  },
  photoThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    marginRight: spacing.sm,
  },
  captureRow: {
    alignItems: 'center',
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capturePressed: {
    opacity: 0.7,
  },
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: palette.white,
  },
  permissionText: {
    color: palette.white,
    fontSize: 17,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  permButton: {
    backgroundColor: palette.blue[500],
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
  permCloseButton: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  permButtonText: {
    color: palette.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
