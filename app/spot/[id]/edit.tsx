import { useCallback, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  Pressable,
  Alert,
  AccessibilityInfo,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useSpotsStore, useMediaStore } from '@/src/stores';
import { useSpotActions } from '@/src/hooks/use-spot-actions';
import { useMediaActions, type NewPhoto } from '@/src/hooks/use-media-actions';
import { primaryPhoto, spotPhotos } from '@/src/utils/spot-photos';
import { getSpotDisplayName } from '@/src/utils/spot-name';
import { importPhotoFromAsset } from '@/src/utils/exif';
import { newId } from '@/src/utils/id';
import { Button } from '@/src/components/Button';
import { FormInput } from '@/src/components/FormField';
import { PhotoGrid } from '@/src/components/PhotoGrid';
import { AddPhotosTile } from '@/src/components/AddPhotosTile';
import { SpotTagFields, type SpotTags } from '@/src/components/SpotTagFields';
import { palette, spacing, radius } from '@/src/constants/theme';
import type { Media, SpotUpdate } from '@/src/types';

/** APP_SPECIFICATIONS: at most 20 photos per spot. */
const MAX_PHOTOS = 20;

/** A picked photo waiting for Save; `key` (the library asset) keeps a photo from being staged twice. */
type StagedPhoto = NewPhoto & { key: string };

/** Drafts render through the grid like saved photos: `resolvePhotoUri` passes the picker's file:// uri through. */
const draftMedia = ({ sourceUri, key: _key, ...fields }: StagedPhoto): Media => ({ ...fields, file_path: sourceUri });

export default function EditSpotScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const spot = useSpotsStore((s) => s.spots.find((sp) => sp.id === id));
  const { updateSpot, removeSpot } = useSpotActions();
  const { removePhotos, savePhotos } = useMediaActions();
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
  // Photos picked from the library; nothing is copied or written until Save, so dismissing drops them.
  const [staged, setStaged] = useState<StagedPhoto[]>([]);
  // The picker is async, so a double tap on '+' must not open it twice.
  const pickingRef = useRef(false);
  // Save awaits the deletes before router.back(), so a second tap must not start another run.
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);

  const photos = spot ? spotPhotos(spot, media) : [];
  const visiblePhotos = photos.filter((p) => !removedIds.includes(p.id));
  // savePhotos puts saved rows in the store before Save clears their drafts; never show one photo twice.
  const gridPhotos = [
    ...visiblePhotos,
    ...staged.filter((d) => !photos.some((p) => p.id === d.id)).map(draftMedia),
  ];
  const stagedIds = useMemo(() => new Set(staged.map((p) => p.id)), [staged]);
  const photoCount = gridPhotos.length;

  const stagePhotoRemoval = useCallback((photoId: string) => {
    // A fast double tap fires twice before re-render, so never append the same id twice.
    setRemovedIds((prev) => (prev.includes(photoId) ? prev : [...prev, photoId]));
    AccessibilityInfo.announceForAccessibility('Photo will be removed when you save');
  }, []);

  // The removed photos come back into their slots, so the newest picks that no longer fit give way.
  const undoRemovals = useCallback(() => {
    setRemovedIds([]);
    const room = MAX_PHOTOS - photos.length;
    if (staged.length > room) {
      setStaged(staged.slice(0, Math.max(0, room)));
      Alert.alert(`${MAX_PHOTOS} photos per spot`, 'The removed photos are back, so the newest added ones were taken off.');
    }
  }, [photos.length, staged]);

  // ✕ on a draft just unstages it: it was never saved, so there is nothing to remove on Save.
  const unstagePhoto = useCallback((photoId: string) => {
    setStaged((prev) => prev.filter((p) => p.id !== photoId));
    AccessibilityInfo.announceForAccessibility('New photo removed');
  }, []);

  const renderBadge = useCallback(
    (m: Media, index: number) => {
      const isNew = stagedIds.has(m.id);
      return (
        <View style={styles.badgeRow} pointerEvents="box-none">
          {isNew ? (
            <View style={styles.newBadge} pointerEvents="none">
              <Text style={styles.newBadgeText}>new</Text>
            </View>
          ) : null}
          <Pressable
            style={styles.removeBadge}
            onPress={() => (isNew ? unstagePhoto(m.id) : stagePhotoRemoval(m.id))}
            disabled={saving}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Remove photo ${index + 1}`}>
            <IconSymbol name="xmark" size={14} color={palette.white} />
          </Pressable>
        </View>
      );
    },
    [stagedIds, saving, stagePhotoRemoval, unstagePhoto],
  );

  const handleAddPhotos = useCallback(async () => {
    // Photos picked while Save runs would be dropped when the sheet closes.
    if (!spot || pickingRef.current || savingRef.current) return;
    pickingRef.current = true;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission?.granted) {
        Alert.alert('Photo access needed', 'Allow photo access in Settings to add photos.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        exif: true,
        quality: 0.8,
        selectionLimit: MAX_PHOTOS - photoCount,
      });
      if (result.canceled || result.assets.length === 0) return;

      const now = new Date().toISOString();
      const drafts = result.assets.map((asset): StagedPhoto => {
        const photo = importPhotoFromAsset(asset, now);
        return {
          key: asset.assetId ?? asset.uri,
          id: newId(),
          spot_id: spot.id,
          sourceUri: asset.uri,
          captured_at: photo.capturedAt,
          location: photo.location ?? undefined,
          created_at: now,
        };
      });
      setStaged((prev) => {
        // The same library photo picked again (or twice in one pick) is staged once.
        const next = [...prev];
        for (const d of drafts) if (!next.some((p) => p.key === d.key)) next.push(d);
        return next.slice(0, MAX_PHOTOS - visiblePhotos.length);
      });
    } catch (err) {
      console.warn('[EditSpot] photo pick failed:', err);
    } finally {
      pickingRef.current = false;
    }
  }, [spot, photoCount, visiblePhotos.length]);

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

      const existing = spotPhotos(spot, media);
      // Only ids whose row was actually deleted count, so a failed delete never leaves the primary pointing nowhere.
      const removed = removedIds.length > 0 ? await removePhotos(removedIds) : [];
      // A removal that failed keeps its slot, so the adds that would take the spot past the cap stay unsaved.
      const toAdd = staged.slice(0, Math.max(0, MAX_PHOTOS - (existing.length - removed.length)));
      // Likewise only photos actually written can become the primary.
      const added = toAdd.length > 0 ? await savePhotos(toAdd.map(({ key: _key, ...photo }) => photo)) : [];
      // savePhotos/removePhotos already updated the store: drop what's done, so the grid never shows a photo twice
      // and a retry after a failed update only retries what failed.
      const addedIds = new Set(added.map((m) => m.id));
      setStaged((prev) => prev.filter((p) => !addedIds.has(p.id)));
      setRemovedIds((prev) => prev.filter((photoId) => !removed.includes(photoId)));
      const someNotRemoved = removed.length < removedIds.length;
      const someNotAdded = added.length < staged.length;

      const primaryId = primaryPhoto(spot, media)?.id;
      if (existing.length === 0) {
        if (added.length > 0) updates.primary_photo_id = added[0].id;
      } else if (primaryId !== undefined && removed.includes(primaryId)) {
        const remaining = existing.filter((p) => !removed.includes(p.id));
        updates.primary_photo_id = remaining[0]?.id ?? added[0]?.id ?? null; // null clears the column
      }

      await updateSpot(spot.id, updates);
      const warning = photoWarning(someNotRemoved, someNotAdded);
      if (warning) {
        // Close the sheet from the alert, so dismissing the sheet can't swallow the alert on iOS.
        Alert.alert(warning.title, warning.message, [{ text: 'OK', onPress: () => router.back() }]);
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
  }, [spot, name, tags, notes, removedIds, staged, media, updateSpot, removePhotos, savePhotos, router]);

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
      <PhotoGrid
        photos={gridPhotos}
        renderBadge={renderBadge}
        trailing={
photoCount < MAX_PHOTOS ? <AddPhotosTile onPress={handleAddPhotos} disabled={saving} /> : undefined
        }
      />
      {removedIds.length > 0 ? (
        <View style={styles.pendingRow}>
          <Text style={styles.photoHint}>
            {removedIds.length === 1 ? '1 photo' : `${removedIds.length} photos`} will be removed when you save.
          </Text>
          <Pressable
            onPress={undoRemovals}
            disabled={saving}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Undo">
            <Text style={styles.undoText}>Undo</Text>
          </Pressable>
        </View>
      ) : null}

      <FormInput value={name} onChangeText={setName} placeholder="Name (optional)" accessibilityLabel="Name" />

      <SpotTagFields value={tags} onChange={setTags} />

      <FormInput
        label="Notes"
        hideLabel
        style={styles.notes}
        value={notes}
        onChangeText={setNotes}
        placeholder="Anything else"
        accessibilityLabel="Notes"
        multiline
        textAlignVertical="top"
      />

      {/* Actions */}
      <View style={styles.actions}>
        <Button title="Save" onPress={handleSave} variant="primary" size="lg" disabled={saving} />
        <Button title="Delete spot" onPress={handleDelete} variant="destructive" size="lg" disabled={saving} />
      </View>
    </ScrollView>
  );
}

/** One alert for whatever part of the photo changes didn't make it; null when everything saved. */
function photoWarning(notRemoved: boolean, notAdded: boolean): { title: string; message: string } | null {
  if (notRemoved && notAdded) {
    return { title: "Some photo changes didn't save", message: 'Some photos are still on this spot and some new ones were not added. Try again later.' };
  }
  if (notRemoved) return { title: "Some photos couldn't be removed", message: "They're still on this spot. Try again later." };
  if (notAdded) return { title: "Some photos couldn't be added", message: 'The others were saved. Try adding them again.' };
  return null;
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
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  newBadge: {
    paddingHorizontal: spacing.sm,
    height: 24,
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: palette.blue[500],
  },
  newBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.white,
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
  notes: {
    minHeight: 88,
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing['2xl'],
  },
});
