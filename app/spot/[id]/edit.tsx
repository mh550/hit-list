import { useCallback, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  AccessibilityInfo,
} from 'react-native';
import { Image } from 'expo-image';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useSpotsStore, useMediaStore } from '@/src/stores';
import { useSpotActions } from '@/src/hooks/use-spot-actions';
import { useMediaActions } from '@/src/hooks/use-media-actions';
import { resolvePhotoUri } from '@/src/utils/photo-storage';
import { primaryPhoto, spotPhotos } from '@/src/utils/spot-photos';
import { getSpotDisplayName } from '@/src/utils/spot-name';
import { Button } from '@/src/components/Button';
import { palette, spacing, radius } from '@/src/constants/theme';
import type { SpotUpdate } from '@/src/types';

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function FieldLabel({ label }: { label: string }) {
  return <Text style={styles.fieldLabel}>{label}</Text>;
}

export default function EditSpotScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const spot = useSpotsStore((s) => s.spots.find((sp) => sp.id === id));
  const { updateSpot, removeSpot } = useSpotActions();
  const { removePhotos } = useMediaActions();
  const media = useMediaStore((s) => (spot ? s.mediaBySpot[spot.id] : undefined));

  // Edit state (local copy)
  const [name, setName] = useState(spot?.name ?? '');
  // Photos staged for removal; nothing is deleted until Save (Cancel/back undoes them, like an edited name).
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  // Save awaits the deletes before router.back(), so a second tap must not start another run.
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);

  const photos = spot ? spotPhotos(spot, media) : [];
  const visiblePhotos = photos.filter((p) => !removedIds.includes(p.id));

  const stagePhotoRemoval = useCallback((photoId: string) => {
    // A fast double tap fires twice before re-render, so never append the same id twice.
    setRemovedIds((prev) => (prev.includes(photoId) ? prev : [...prev, photoId]));
    AccessibilityInfo.announceForAccessibility('Photo will be removed when you save');
  }, []);

  const handleSave = useCallback(async () => {
    if (!spot || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const updates: SpotUpdate = {
        name: name.trim() || null, // null clears the stored name; undefined would keep the old one
        updated_at: new Date().toISOString(),
      };

      let someNotRemoved = false;
      if (removedIds.length > 0) {
        // Only ids whose row was actually deleted count, so a failed delete never leaves the primary pointing nowhere.
        const removed = await removePhotos(removedIds);
        someNotRemoved = removed.length < removedIds.length;
        const primaryId = primaryPhoto(spot, media)?.id;
        if (primaryId !== undefined && removed.includes(primaryId)) {
          const remaining = spotPhotos(spot, media).filter((p) => !removed.includes(p.id));
          updates.primary_photo_id = remaining[0]?.id ?? null; // null clears the column
        }
      }

      await updateSpot(spot.id, updates);
      if (someNotRemoved) {
        // Close the sheet from the alert, so dismissing the sheet can't swallow the alert on iOS.
        Alert.alert("Some photos couldn't be removed", "They're still on this spot. Try again later.", [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        router.back();
      }
    } catch (err) {
      // The screen stays open, so let the user try again.
      console.error('[EditSpot] save failed:', err);
      savingRef.current = false;
      setSaving(false);
      Alert.alert("Couldn't save", 'Please try again.');
    }
  }, [spot, name, removedIds, media, updateSpot, removePhotos, router]);

  const handleDelete = useCallback(() => {
    if (!spot) return;
    Alert.alert(
      `Delete ${getSpotDisplayName(spot)}?`,
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await removeSpot(spot.id);
            router.dismissAll();
          },
        },
      ],
    );
  }, [spot, removeSpot, router]);

  if (!spot) {
    return (
      <View style={styles.centered}>
        <Text>Spot not found</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      {photos.length > 0 ? (
        <>
          <SectionHeader title="Photos" />
          {visiblePhotos.length > 0 ? (
            <ScrollView
              horizontal
              style={styles.photoRow}
              contentContainerStyle={styles.photoRowContent}
              showsHorizontalScrollIndicator={false}>
              {visiblePhotos.map((m, i) => (
                <View key={m.id} style={styles.thumbWrap}>
                  <Image source={{ uri: resolvePhotoUri(m.file_path) }} style={styles.thumb} contentFit="cover" />
                  <Pressable
                    style={styles.thumbRemove}
                    onPress={() => stagePhotoRemoval(m.id)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove photo ${i + 1}`}>
                    <IconSymbol name="xmark" size={14} color={palette.white} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}
          {removedIds.length > 0 ? (
            <View style={styles.pendingRow}>
              <Text style={styles.photoHint}>
                {removedIds.length === 1 ? '1 photo' : `${removedIds.length} photos`} will be removed when you save.
              </Text>
              <Pressable
                onPress={() => setRemovedIds([])}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Undo">
                <Text style={styles.undoText}>Undo</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      ) : null}

      <View style={styles.field}>
        <FieldLabel label="Name" />
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Name (optional)"
          placeholderTextColor={palette.gray[400]}
        />
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Button title="Save" onPress={handleSave} variant="primary" size="lg" disabled={saving} />
        <Button title="Delete Spot" onPress={handleDelete} variant="destructive" size="lg" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'] * 2,
    gap: spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.gray[900],
    marginTop: spacing.lg,
  },
  field: {
    gap: spacing.sm,
  },
  photoRow: {
    flexGrow: 0, // a horizontal ScrollView grows to fill the column by default
  },
  photoRowContent: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
    paddingRight: spacing.xs,
  },
  thumbWrap: {
    width: 72,
    height: 72,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: palette.gray[200],
  },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  photoHint: {
    flexShrink: 1,
    fontSize: 14,
    color: palette.gray[600],
  },
  undoText: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.blue[500],
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.gray[600],
  },
  input: {
    borderWidth: 1,
    borderColor: palette.gray[300],
    borderRadius: radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: palette.gray[900],
    backgroundColor: palette.white,
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing['2xl'],
  },
});
