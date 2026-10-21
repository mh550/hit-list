import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TextInput, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';

import { useSpotActions } from '@/src/hooks/use-spot-actions';
import { useMediaActions } from '@/src/hooks/use-media-actions';
import { SpotTagFields, type SpotTags } from '@/src/components';
import { useMediaStore, useSettingsStore, useSpotsStore } from '@/src/stores';
import { newId } from '@/src/utils/id';
import { isKnownLocation, NO_LOCATION } from '@/src/utils/geo';
import { nearbyLabel, nearbySpots } from '@/src/utils/nearby-spots';
import { resolvePhotoUri } from '@/src/utils/photo-storage';
import { getSpotDisplayName } from '@/src/utils/spot-name';
import { primaryPhoto } from '@/src/utils/spot-photos';
import { palette, spacing, radius } from '@/src/constants/theme';
import { UnitSystem, type Spot } from '@/src/types';

/** At most this many existing spots are offered (nearest first). */
const MAX_NEARBY = 3;

export default function ReviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    photoUris: string;
    latitude: string;
    longitude: string;
  }>();

  const { addSpot, updateSpot } = useSpotActions();
  const { savePhotos } = useMediaActions();
  const [name, setName] = useState('');
  // Tags stay behind 'Add details' so the fast path is photo → Save (spec §2.7).
  const [showDetails, setShowDetails] = useState(false);
  const [tags, setTags] = useState<SpotTags>({ feature_types: [], stopped: false });
  // Shared by Save and 'Add photos there': whichever is pressed first runs, once. The ref also stops a second press
  // that lands before the re-render; the state greys the buttons.
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  // Only photos not yet saved stay on screen; once Save has created its spot, a retry adds them there (as D31).
  const [photoUris, setPhotoUris] = useState(() => (params.photoUris ? params.photoUris.split(',') : []));
  const [createdId, setCreatedId] = useState<string>();
  const spots = useSpotsStore((s) => s.spots);
  const mediaBySpot = useMediaStore((s) => s.mediaBySpot);
  const importRadius = useSettingsStore((s) => s.batch_import_radius);
  const imperial = useSettingsStore((s) => s.units === UnitSystem.Imperial);

  const latitude = params.latitude ? parseFloat(params.latitude) : NO_LOCATION.latitude;
  const longitude = params.longitude ? parseFloat(params.longitude) : NO_LOCATION.longitude;
  const hasLocation = isKnownLocation({ latitude, longitude });
  // D25: a spot already this close might be the same one, so offer to add the photos to it instead.
  const nearby = useMemo(
    () =>
      photoUris.length === 0
        ? []
        : nearbySpots({ latitude, longitude }, spots, importRadius)
            .filter((s) => s.id !== createdId)
            .slice(0, MAX_NEARBY),
    [photoUris.length, latitude, longitude, spots, importRadius, createdId],
  );

  const start = () => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    return true;
  };

  const fail = (title: string, message: string) => {
    savingRef.current = false;
    setSaving(false);
    Alert.alert(title, message);
  };

  /**
   * Saves the photos still on screen to `spotId`. savePhotos logs a failed row and leaves it out rather than
   * throwing, so whatever it did not save stays on screen with an Alert, and `ok` is false.
   */
  const saveTo = async (spotId: string, firstId: string = newId()) => {
    const now = new Date().toISOString();
    const ids = photoUris.map((_, i) => (i === 0 ? firstId : newId()));
    const saved = await savePhotos(
      photoUris.map((uri, i) => ({
        sourceUri: uri,
        id: ids[i],
        spot_id: spotId,
        location: hasLocation ? { latitude, longitude } : undefined,
        created_at: now,
      })),
    );
    const savedIds = new Set(saved.map((m) => m.id));
    const unsaved = photoUris.filter((_, i) => !savedIds.has(ids[i]));
    if (unsaved.length > 0) {
      setPhotoUris(unsaved);
      fail("Some photos weren't saved", 'The photos still shown were not saved. Please try again.');
    }
    return { saved, ok: unsaved.length === 0 };
  };

  const handleSave = async () => {
    if (!start()) return;

    if (createdId) {
      if ((await saveTo(createdId)).ok) router.dismissAll();
      return;
    }

    const now = new Date().toISOString();
    const spotId = newId();
    const firstPhotoId = photoUris.length > 0 ? newId() : undefined;

    const spot: Spot = {
      id: spotId,
      name: name.trim() || undefined,
      location: { latitude, longitude },
      created_at: now,
      updated_at: now,
      ...tags,
      primary_photo_id: firstPhotoId,
    };

    try {
      await addSpot(spot);
    } catch {
      fail("Couldn't save the spot", 'Please try again.');
      return;
    }

    if (!(await saveTo(spotId, firstPhotoId)).ok) {
      setCreatedId(spotId);
      return;
    }
    router.dismissAll();
  };

  /** Adds the photos to an existing spot and opens it; the name and tags typed here are dropped (D30). */
  const handleAddTo = async (target: Spot) => {
    if (!start()) return;

    const hadPhoto = primaryPhoto(target, mediaBySpot[target.id]) !== undefined;
    const { saved, ok } = await saveTo(target.id);
    if (!hadPhoto && saved.length > 0) {
      // A failed write was logged and rolled back by updateSpot; the spot still shows its first photo.
      await updateSpot(target.id, { primary_photo_id: saved[0].id }).catch(() => {});
    }
    if (!ok) return;

    router.dismissAll();
    router.push(`/spot/${target.id}` as `/spot/${string}`);
  };

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

      {showDetails ? (
        <SpotTagFields value={tags} onChange={setTags} />
      ) : (
        <Pressable
          style={styles.detailsLink}
          onPress={() => setShowDetails(true)}
          accessibilityRole="button">
          <Text style={styles.detailsLinkText}>Add details</Text>
        </Pressable>
      )}

      {/* Location info */}
      {hasLocation ? (
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

      {nearby.length > 0 ? (
        <View style={styles.nearbyCard}>
          <Text style={styles.nearbyTitle}>Already have this spot?</Text>
          {nearby.map((spot) => {
            const photo = primaryPhoto(spot, mediaBySpot[spot.id]);
            return (
              <View key={spot.id} style={styles.nearbyRow}>
                {photo ? (
                  <Image
                    testID={`nearby-thumb-${spot.id}`}
                    source={{ uri: resolvePhotoUri(photo.file_path) }}
                    style={styles.nearbyThumb}
                    contentFit="cover"
                  />
                ) : (
                  <View testID={`nearby-thumb-placeholder-${spot.id}`} style={styles.nearbyThumb} />
                )}
                <Text style={styles.nearbyText} numberOfLines={2}>
                  {nearbyLabel({ latitude, longitude }, spot, imperial)}
                </Text>
                <Pressable
                  style={styles.nearbyButton}
                  onPress={() => handleAddTo(spot)}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel={`Add photos there, ${getSpotDisplayName(spot)}`}>
                  <Text style={styles.nearbyButtonText}>Add photos there</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Save button */}
      <Pressable
        style={({ pressed }) => [
          styles.saveButton,
          (pressed || saving) && styles.savePressed,
        ]}
        onPress={handleSave}
        disabled={saving}
        accessibilityLabel="Save spot"
        accessibilityRole="button">
        <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
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
  detailsLink: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  detailsLinkText: {
    fontSize: 16,
    fontWeight: '500',
    color: palette.blue[500],
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
  nearbyCard: {
    backgroundColor: palette.gray[50],
    padding: spacing.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    gap: spacing.md,
  },
  nearbyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.gray[700],
  },
  nearbyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  nearbyThumb: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    backgroundColor: palette.gray[200],
  },
  nearbyText: {
    flex: 1,
    fontSize: 15,
    color: palette.gray[900],
  },
  nearbyButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  nearbyButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: palette.blue[500],
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
