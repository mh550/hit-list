import { useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';

import { useSpotActions } from '@/src/hooks/use-spot-actions';
import { useMediaActions } from '@/src/hooks/use-media-actions';
import { Chip, ChipGroup } from '@/src/components';
import { selectMySpots, useMediaStore, useSettingsStore, useSpotsStore } from '@/src/stores';
import { useAuthStore } from '@/src/stores/auth-store';
import { newId } from '@/src/utils/id';
import { formatSpotDate, getSpotDisplayName } from '@/src/utils/spot-name';
import { NO_LOCATION } from '@/src/utils/geo';
import { nearbyLabel, nearbySpots } from '@/src/utils/nearby-spots';
import { primaryPhoto } from '@/src/utils/spot-photos';
import { palette, spacing, radius } from '@/src/constants/theme';
import { UnitSystem, type Spot } from '@/src/types';
import type { ImportPhoto } from '@/src/utils/import-clustering';

interface SpotGroup {
  photos: ImportPhoto[];
  name: string;
  /** An existing spot's id to add the photos to (D25); undefined = 'New spot', the default. */
  target?: string;
}

const MAX_OFFERS = 3;

/** Where a group's new spot would go: its first photo's location. */
const groupLocation = (group: SpotGroup) => group.photos[0]?.location ?? NO_LOCATION;

export default function ImportReviewScreen() {
  const { groupsJson } = useLocalSearchParams<{ groupsJson: string }>();
  const router = useRouter();
  const { addSpot, updateSpot } = useSpotActions();
  const { savePhotos } = useMediaActions();
  // The ref stops a second press that lands before the re-render; the state greys and locks the screen.
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const allSpots = useSpotsStore((s) => s.spots);
  const uid = useAuthStore((s) => s.userId);
  // Only the rider's own spots are offered here: another rider's (S8) never takes photos or goes in a list (D47).
  const spots = useMemo(() => selectMySpots(allSpots, uid), [allSpots, uid]);
  const mediaBySpot = useMediaStore((s) => s.mediaBySpot);
  const importRadius = useSettingsStore((s) => s.batch_import_radius);
  const imperial = useSettingsStore((s) => s.units === UnitSystem.Imperial);

  const parsedGroups: ImportPhoto[][] = groupsJson ? JSON.parse(groupsJson) : [];
  const [groups, setGroups] = useState<SpotGroup[]>(() =>
    parsedGroups.map((photos) => ({
      photos,
      name: '', // blank = untitled: shows the D4 label and gets a town
    })),
  );

  const updateName = (index: number, name: string) => {
    setGroups((prev) => prev.map((g, i) => (i === index ? { ...g, name } : g)));
  };

  const setTarget = (index: number, target: string | undefined) => {
    setGroups((prev) => prev.map((g, i) => (i === index ? { ...g, target } : g)));
  };

  const removeGroup = (index: number) => {
    setGroups((prev) => prev.filter((_, i) => i !== index));
  };

  // Only spots already in the store count, so two groups of this import never offer each other. A chosen spot stays
  // in the row even when it is not nearby (a retry's new spot without a location), so 'New spot' stays reachable.
  const offers = useMemo(
    () =>
      groups.map((group) => {
        const near = nearbySpots(groupLocation(group), spots, importRadius).slice(0, MAX_OFFERS);
        const chosen = near.some((s) => s.id === group.target) ? undefined : spots.find((s) => s.id === group.target);
        // The distance line follows the choice when the chosen spot is nearby, else names the nearest.
        const shown = near.find((s) => s.id === group.target) ?? near[0];
        return { shown, choices: chosen ? [...near, chosen] : near };
      }),
    [groups, spots, importRadius],
  );
  const newSpotCount = groups.filter((g) => g.target === undefined).length;
  const allToExisting = groups.length > 0 && newSpotCount === 0;

  /**
   * Saves a group's photos to `spotId` and resolves with the ones that were not saved (savePhotos logs a failed row
   * and leaves it out rather than throwing).
   */
  const savePhotosTo = async (photos: ImportPhoto[], spotId: string, firstId: string = newId()) => {
    const now = new Date().toISOString();
    const ids = photos.map((_, i) => (i === 0 ? firstId : newId()));
    const saved = await savePhotos(
      photos.map((photo, i) => ({
        sourceUri: photo.uri,
        id: ids[i],
        spot_id: spotId,
        location: photo.location ?? undefined,
        captured_at: photo.capturedAt,
        created_at: now,
      })),
    );
    const savedIds = new Set(saved.map((m) => m.id));
    return { saved, unsaved: photos.filter((_, i) => !savedIds.has(ids[i])) };
  };

  /** Adds a group's photos to an existing spot; creates nothing (D30: the group's name is not used). */
  const addToExisting = async (group: SpotGroup, target: string, setsPrimary: boolean) => {
    const { saved, unsaved } = await savePhotosTo(group.photos, target);
    if (setsPrimary && saved.length > 0) {
      // A failed write was logged and rolled back by updateSpot; the spot still shows its first photo.
      await updateSpot(target, { primary_photo_id: saved[0].id }).catch(() => {});
    }
    return { target, unsaved };
  };

  /** Creates the group's spot and saves its photos there; unsaved photos are returned aimed at the new spot. */
  const createSpot = async (group: SpotGroup) => {
    const now = new Date().toISOString();
    const spotId = newId();
    const firstMediaId = newId();

    const spot: Spot = {
      id: spotId,
      name: group.name.trim() || undefined,
      location: groupLocation(group),
      created_at: now, // the import, not the photo's capture date (D13); media keeps captured_at
      updated_at: now,
      feature_types: [],
      stopped: false,
      primary_photo_id: group.photos.length > 0 ? firstMediaId : undefined,
    };

    await addSpot(spot);

    const { unsaved } = await savePhotosTo(group.photos, spotId, firstMediaId);
    return { target: spotId, unsaved };
  };

  const handleImportAll = async () => {
    if (savingRef.current || groups.length === 0) return;
    savingRef.current = true;
    setSaving(true);

    // Decided up front so the parallel writes never race on primary_photo_id: of the groups going to a spot with no
    // photo, the first one in order sets it.
    const primarySetBy = new Map<string, SpotGroup>();
    for (const group of groups) {
      const target = group.target === undefined ? undefined : spots.find((s) => s.id === group.target);
      if (target && !primarySetBy.has(target.id) && primaryPhoto(target, mediaBySpot[target.id]) === undefined) {
        primarySetBy.set(target.id, group);
      }
    }

    const results = await Promise.allSettled(
      groups.map((group) =>
        group.target === undefined
          ? createSpot(group)
          : addToExisting(group, group.target, primarySetBy.get(group.target) === group),
      ),
    );
    savingRef.current = false;
    setSaving(false);

    // Only what was not saved stays on screen, aimed at the spot it was going to (a new spot exists once addSpot
    // resolved; one the DB refused rejects and stays a new spot), so a retry neither imports a photo twice nor creates
    // a second spot.
    const failed = groups.flatMap((group, i): SpotGroup[] => {
      const result = results[i];
      if (result.status === 'rejected') return [group];
      const { target, unsaved } = result.value;
      return unsaved.length > 0 ? [{ ...group, photos: unsaved, target }] : [];
    });
    if (failed.length > 0) {
      setGroups(failed);
      Alert.alert("Some photos weren't imported", 'The groups still shown were not saved. Please try again.');
      return;
    }
    router.dismissAll();
  };

  if (parsedGroups.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No photo groups to import.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.subtitle}>
          {allToExisting
            ? 'Photos go to spots you already have.'
            : `${newSpotCount} spot${newSpotCount !== 1 ? 's' : ''} from your photos. Name each spot or leave blank for auto-naming.`}
        </Text>

        {groups.map((group, groupIdx) => (
          // The first photo's URI is unique to its group and survives removing the groups above it.
          <View key={group.photos[0]?.uri ?? groupIdx} style={styles.groupCard}>
            {/* Photos strip */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
              {group.photos.map((p, i) => (
                <Image
                  key={i}
                  source={{ uri: p.uri }}
                  style={styles.photoThumb}
                  contentFit="cover"
                />
              ))}
            </ScrollView>

            {/* Meta */}
            <Text style={styles.photoCount}>
              {group.photos.length} photo{group.photos.length !== 1 ? 's' : ''}
              {group.photos[0]?.capturedAt
                ? ` · ${formatSpotDate(group.photos[0].capturedAt)}`
                : ''}
            </Text>

            {/* D25: an existing spot this close might be the same one */}
            {offers[groupIdx].choices.length > 0 && (
              <>
                {offers[groupIdx].shown ? (
                  <Text style={styles.nearbyText} numberOfLines={2}>
                    {nearbyLabel(groupLocation(group), offers[groupIdx].shown, imperial)}
                  </Text>
                ) : null}
                <ChipGroup>
                  <Chip
                    label="New spot"
                    role="button"
                    selected={group.target === undefined}
                    disabled={saving}
                    onPress={() => setTarget(groupIdx, undefined)}
                  />
                  {offers[groupIdx].choices.map((spot) => (
                    <Chip
                      key={spot.id}
                      label={`Add photos to ${getSpotDisplayName(spot)}`}
                      role="button"
                      selected={group.target === spot.id}
                      disabled={saving}
                      onPress={() => setTarget(groupIdx, spot.id)}
                    />
                  ))}
                </ChipGroup>
              </>
            )}

            {/* Name input: only a new spot gets a name (D30) */}
            {group.target === undefined && (
              <TextInput
                style={styles.nameInput}
                value={group.name}
                onChangeText={(t) => updateName(groupIdx, t)}
                editable={!saving}
                placeholder="Spot name (optional)"
                placeholderTextColor={palette.gray[400]}
                returnKeyType="done"
              />
            )}

            <Pressable
              onPress={() => removeGroup(groupIdx)}
              disabled={saving}
              hitSlop={8}
              style={styles.removeRow}
              accessibilityRole="button">
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [
            styles.importButton,
            (pressed || saving) && styles.importButtonPressed,
          ]}
          onPress={handleImportAll}
          disabled={saving}
          accessibilityRole="button">
          {saving ? (
            <ActivityIndicator color={palette.white} accessibilityLabel="Importing" />
          ) : (
            <Text style={styles.importButtonText}>
              {allToExisting
                ? 'Add photos'
                : `Import ${newSpotCount} Spot${newSpotCount !== 1 ? 's' : ''}`}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
    gap: spacing.lg,
  },
  subtitle: {
    fontSize: 14,
    color: palette.gray[500],
  },
  groupCard: {
    backgroundColor: palette.gray[50],
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: spacing.md,
    gap: spacing.sm,
  },
  photoStrip: {
    maxHeight: 80,
  },
  photoThumb: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    marginRight: spacing.xs,
  },
  photoCount: {
    fontSize: 13,
    color: palette.gray[500],
  },
  nearbyText: {
    fontSize: 14,
    color: palette.gray[700],
  },
  nameInput: {
    borderWidth: 1,
    borderColor: palette.gray[300],
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: palette.gray[900],
    backgroundColor: palette.white,
  },
  removeRow: {
    alignSelf: 'flex-end',
  },
  removeText: {
    fontSize: 13,
    color: palette.red[500],
    fontWeight: '500',
  },
  footer: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.gray[200],
    backgroundColor: palette.white,
  },
  importButton: {
    backgroundColor: palette.blue[500],
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
  },
  importButtonPressed: {
    backgroundColor: palette.blue[600],
  },
  importButtonText: {
    color: palette.white,
    fontSize: 17,
    fontWeight: '600',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: palette.gray[500],
  },
});
