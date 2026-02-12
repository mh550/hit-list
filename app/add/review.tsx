import { useCallback, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TextInput, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { v4 as uuid } from 'uuid';

import { useSpotsStore } from '@/src/stores';
import { palette, spacing, radius } from '@/src/constants/theme';
import { SpotStatus } from '@/src/types';
import type { Spot } from '@/src/types';

export default function ReviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    photoUris: string;
    latitude: string;
    longitude: string;
  }>();

  const addSpot = useSpotsStore((s) => s.addSpot);
  const [name, setName] = useState('');

  const photoUris = params.photoUris ? params.photoUris.split(',') : [];
  const latitude = params.latitude ? parseFloat(params.latitude) : 0;
  const longitude = params.longitude ? parseFloat(params.longitude) : 0;

  const handleSave = useCallback(() => {
    const now = new Date().toISOString();
    const spot: Spot = {
      id: uuid(),
      name: name.trim() || undefined,
      location: { latitude, longitude },
      created_at: now,
      updated_at: now,
      status: SpotStatus.Draft,
      feature: {},
      in_run: { setup_options: [] },
      landing: {},
      metadata: {},
    };

    addSpot(spot);

    // Navigate back to spots list
    router.dismissAll();
  }, [name, latitude, longitude, addSpot, router]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      {/* Photo thumbnails */}
      {photoUris.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
          {photoUris.map((uri, i) => (
            <Image
              key={i}
              source={{ uri }}
              style={styles.thumb}
              contentFit="cover"
            />
          ))}
        </ScrollView>
      ) : (
        <View style={styles.noPhotos}>
          <Text style={styles.noPhotosText}>No photos captured</Text>
        </View>
      )}

      {/* Name input */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Spot Name (optional)</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Downtown Rail, Bridge Ledge..."
          placeholderTextColor={palette.gray[400]}
          returnKeyType="done"
          autoFocus
        />
        <Text style={styles.hint}>
          Leave blank to auto-name from location
        </Text>
      </View>

      {/* Location info */}
      {latitude !== 0 ? (
        <View style={styles.locationInfo}>
          <Text style={styles.locationLabel}>Location captured</Text>
          <Text style={styles.locationCoords}>
            {latitude.toFixed(4)}, {longitude.toFixed(4)}
          </Text>
        </View>
      ) : (
        <View style={styles.locationInfo}>
          <Text style={styles.locationLabel}>No location available</Text>
        </View>
      )}

      {/* Save button */}
      <Pressable
        style={({ pressed }) => [styles.saveButton, pressed && styles.savePressed]}
        onPress={handleSave}
        accessibilityLabel="Save spot"
        accessibilityRole="button">
        <Text style={styles.saveText}>Save as Draft</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.xl,
    paddingBottom: spacing['3xl'],
  },
  photoRow: {
    maxHeight: 120,
  },
  thumb: {
    width: 100,
    height: 100,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    marginRight: spacing.sm,
  },
  noPhotos: {
    height: 100,
    backgroundColor: palette.gray[100],
    borderRadius: radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPhotosText: {
    color: palette.gray[400],
    fontSize: 15,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.gray[700],
  },
  input: {
    borderWidth: 1,
    borderColor: palette.gray[300],
    borderRadius: radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: palette.gray[900],
    backgroundColor: palette.white,
  },
  hint: {
    fontSize: 13,
    color: palette.gray[400],
  },
  locationInfo: {
    backgroundColor: palette.gray[50],
    padding: spacing.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    gap: spacing.xs,
  },
  locationLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.gray[600],
  },
  locationCoords: {
    fontSize: 13,
    color: palette.gray[500],
    fontFamily: 'monospace',
  },
  saveButton: {
    backgroundColor: palette.blue[500],
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
  },
  savePressed: {
    backgroundColor: palette.blue[600],
  },
  saveText: {
    color: palette.white,
    fontSize: 17,
    fontWeight: '600',
  },
});
