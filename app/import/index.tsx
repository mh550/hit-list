import { useCallback, useState } from 'react';
import { StyleSheet, View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { useSettingsStore } from '@/src/stores/settings-store';
import { importPhotoFromAsset } from '@/src/utils/exif';
import { groupPhotosByProximity } from '@/src/utils/import-clustering';
import { palette, spacing, radius } from '@/src/constants/theme';

export default function ImportScreen() {
  const router = useRouter();
  const batchRadius = useSettingsStore((s) => s.batch_import_radius);
  const [loading, setLoading] = useState(false);

  const handleSelectPhotos = useCallback(async () => {
    setLoading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        exif: true,
        quality: 0.8,
      });

      if (result.canceled || result.assets.length === 0) {
        setLoading(false);
        return;
      }

      const now = new Date().toISOString();
      const photos = result.assets.map((asset) => importPhotoFromAsset(asset, now));

      const groups = groupPhotosByProximity(photos, batchRadius);

      // Serialize groups for navigation (pass as JSON)
      router.push({
        pathname: '/import/review',
        params: { groupsJson: JSON.stringify(groups) },
      });
    } finally {
      setLoading(false);
    }
  }, [batchRadius, router]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Import Photos</Text>
      <Text style={styles.subtitle}>
        Select photos from your library. Photos taken at the same spot will be grouped together
        (within {batchRadius}m).
      </Text>

      {loading ? (
        <ActivityIndicator color={palette.blue[500]} style={styles.loader} />
      ) : (
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={handleSelectPhotos}
          accessibilityRole="button">
          <Text style={styles.buttonText}>Select Photos</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: palette.gray[900],
  },
  subtitle: {
    fontSize: 15,
    color: palette.gray[500],
    textAlign: 'center',
    lineHeight: 22,
  },
  loader: {
    marginTop: spacing.md,
  },
  button: {
    backgroundColor: palette.blue[500],
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    marginTop: spacing.md,
  },
  buttonPressed: {
    backgroundColor: palette.blue[600],
  },
  buttonText: {
    color: palette.white,
    fontSize: 17,
    fontWeight: '600',
  },
});
