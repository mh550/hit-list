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
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useSpotsStore, useMediaStore } from '@/src/stores';
import { useSpotActions } from '@/src/hooks/use-spot-actions';
import { useMediaActions } from '@/src/hooks/use-media-actions';
import { primaryPhoto, spotPhotos } from '@/src/utils/spot-photos';
import { getSpotDisplayName } from '@/src/utils/spot-name';
import { Button } from '@/src/components/Button';
import { PhotoGrid } from '@/src/components/PhotoGrid';
import { SpotTagFields, type SpotTags } from '@/src/components/SpotTagFields';
import { palette, spacing, radius } from '@/src/constants/theme';
import type { Media, SpotUpdate } from '@/src/types';

/** Visible only: the input carries the same accessibilityLabel, so VoiceOver skips this Text. */
function FieldLabel({ label }: { label: string }) {
  return (
    <Text style={styles.fieldLabel} accessibilityElementsHidden importantForAccessibility="no">
      {label}
    </Text>
  );
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
  const [tags, setTags] = useState<SpotTags>({
    feature_types: spot?.feature_types ?? [],
    stopped: spot?.stopped ?? false,
    natural_speed: spot?.natural_speed,
  });
  const [notes, setNotes] = useState(spot?.notes ?? '');
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

  const renderRemoveBadge = useCallback(
    (m: Media, index: number) => (
      <Pressable
        style={styles.removeBadge}
        onPress={() => stagePhotoRemoval(m.id)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`Remove photo ${index + 1}`}>
        <IconSymbol name="xmark" size={14} color={palette.white} />
      </Pressable>
    ),
    [stagePhotoRemoval],
  );

  const handleSave = useCallback(async () => {
    if (!spot || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const updates: SpotUpdate = {
        name: name.trim() || null, // null clears the stored name; undefined would keep the old one
        feature_types: tags.feature_types,
        stopped: tags.stopped,
        natural_speed: tags.natural_speed ?? null, // 0 (None) is kept; only unrated clears
        notes: notes.trim() || null,
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
  }, [spot, name, tags, notes, removedIds, media, updateSpot, removePhotos, router]);

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
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets>
      <PhotoGrid photos={visiblePhotos} renderBadge={renderRemoveBadge} />
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

      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Name (optional)"
        placeholderTextColor={palette.gray[400]}
        accessibilityLabel="Name"
      />

      <SpotTagFields value={tags} onChange={setTags} />

      <View style={styles.field}>
        <FieldLabel label="Notes" />
        <TextInput
          style={[styles.input, styles.notes]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything else"
          placeholderTextColor={palette.gray[400]}
          accessibilityLabel="Notes"
          multiline
          textAlignVertical="top"
        />
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Button title="Save" onPress={handleSave} variant="primary" size="lg" disabled={saving} />
        <Button title="Delete spot" onPress={handleDelete} variant="destructive" size="lg" />
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
  field: {
    gap: spacing.sm,
  },
  removeBadge: {
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
  notes: {
    minHeight: 88,
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing['2xl'],
  },
});
