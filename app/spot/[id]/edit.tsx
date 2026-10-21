import { useCallback, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  Switch,
  Alert,
  AccessibilityInfo,
} from 'react-native';
import { Image } from 'expo-image';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useSpotsStore, useMediaStore } from '@/src/stores';
import { useSettingsStore } from '@/src/stores/settings-store';
import { useSpotActions } from '@/src/hooks/use-spot-actions';
import { useMediaActions } from '@/src/hooks/use-media-actions';
import { resolvePhotoUri } from '@/src/utils/photo-storage';
import { primaryPhoto, spotPhotos } from '@/src/utils/spot-photos';
import { getSpotDisplayName } from '@/src/utils/spot-name';
import { initialDimText, dimensionFromInput } from '@/src/utils/units';
import { StarRating } from '@/src/components/StarRating';
import { Chip, ChipGroup } from '@/src/components/Chip';
import { Button } from '@/src/components/Button';
import { palette, spacing, radius } from '@/src/constants/theme';
import { STOP_TYPE_LABELS } from '@/src/constants/labels';
import { FeatureType, Material, LandingSurface, StopType } from '@/src/types';
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
  const units = useSettingsStore((s) => s.units);

  // Edit state (local copy)
  const [name, setName] = useState(spot?.name ?? '');
  const [featureType, setFeatureType] = useState(spot?.feature.type);
  const [customType, setCustomType] = useState(spot?.feature.custom_type ?? '');
  const [shape, setShape] = useState(spot?.feature.shape ?? '');
  // Display texts as first shown; a field still equal to its initial text saves the stored metres exactly.
  const [initialDims] = useState(() => ({
    length: initialDimText(spot?.feature.dimensions?.length, units),
    height: initialDimText(spot?.feature.dimensions?.height, units),
    width: initialDimText(spot?.feature.dimensions?.width, units),
  }));
  const [length, setLength] = useState(initialDims.length);
  const [height, setHeight] = useState(initialDims.height);
  const [width, setWidth] = useState(initialDims.width);
  const [material, setMaterial] = useState(spot?.feature.material);
  const [isStopped, setIsStopped] = useState(spot?.feature.skate_stops?.is_stopped ?? false);
  const [stopType, setStopType] = useState<StopType | undefined>(spot?.feature.skate_stops?.stop_type);
  const [stopDetails, setStopDetails] = useState(spot?.feature.skate_stops?.stop_description ?? '');
  const [removable, setRemovable] = useState(spot?.feature.skate_stops?.removable ?? false);
  const [difficulty, setDifficulty] = useState(spot?.feature.difficulty ?? 0);
  const [naturalSpeed, setNaturalSpeed] = useState(spot?.in_run.natural_speed ?? 0);
  const [landingDifficulty, setLandingDifficulty] = useState(spot?.landing.difficulty ?? 0);
  const [landingSurface, setLandingSurface] = useState(spot?.landing.surface);
  const [intensity, setIntensity] = useState(spot?.metadata.intensity ?? 0);
  const [bustability, setBustability] = useState(spot?.metadata.bustability ?? 0);
  const [bustNotes, setBustNotes] = useState(spot?.metadata.bustability_notes ?? '');
  const [notes, setNotes] = useState(spot?.metadata.notes ?? '');
  // Photos staged for removal; nothing is deleted until Save (Cancel/back undoes, like the other fields).
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
      const stored = spot.feature.dimensions;

      const updates: SpotUpdate = {
        name: name.trim() || null, // null clears the stored name; undefined would keep the old one
        feature: {
          type: featureType,
          custom_type: featureType === FeatureType.Other ? customType : undefined,
          shape: shape || undefined,
          dimensions: {
            length: dimensionFromInput(length, initialDims.length, stored?.length, units),
            height: dimensionFromInput(height, initialDims.height, stored?.height, units),
            width: dimensionFromInput(width, initialDims.width, stored?.width, units),
          },
          material,
          skate_stops: isStopped
            ? {
                is_stopped: true,
                stop_type: stopType,
                stop_description: stopDetails.trim() || undefined,
                removable,
              }
            : undefined,
          difficulty: difficulty || undefined,
        },
        in_run: {
          natural_speed: naturalSpeed || undefined,
        },
        landing: {
          difficulty: landingDifficulty || undefined,
          surface: landingSurface,
        },
        metadata: {
          intensity: intensity || undefined,
          bustability: bustability || undefined,
          bustability_notes: bustNotes || undefined,
          notes: notes || undefined,
        },
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
  }, [
    spot, name, featureType, customType, shape, length, height, width, initialDims,
    material, isStopped, stopType, stopDetails, removable, difficulty, naturalSpeed, landingDifficulty,
    landingSurface, intensity, bustability, bustNotes, notes, units, removedIds, media,
    updateSpot, removePhotos, router,
  ]);

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

  const featureTypes = Object.values(FeatureType);
  const materials = Object.values(Material);
  const stopTypes = Object.values(StopType);
  const surfaces = Object.values(LandingSurface);

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

      {/* Basic Info */}
      <SectionHeader title="Basic Info" />
      <View style={styles.field}>
        <FieldLabel label="Name" />
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Spot name (optional)"
          placeholderTextColor={palette.gray[400]}
        />
      </View>

      {/* Feature */}
      <SectionHeader title="Feature" />
      <View style={styles.field}>
        <FieldLabel label="Type" />
        <ChipGroup>
          {featureTypes.map((t) => (
            <Chip
              key={t}
              label={t.replace(/_/g, ' ')}
              selected={featureType === t}
              onPress={() => setFeatureType(featureType === t ? undefined : t)}
            />
          ))}
        </ChipGroup>
      </View>

      {featureType === FeatureType.Other ? (
        <View style={styles.field}>
          <FieldLabel label="Custom Type" />
          <TextInput
            style={styles.input}
            value={customType}
            onChangeText={setCustomType}
            placeholder="Enter custom type"
            placeholderTextColor={palette.gray[400]}
          />
        </View>
      ) : null}

      <View style={styles.field}>
        <FieldLabel label="Shape" />
        <TextInput
          style={styles.input}
          value={shape}
          onChangeText={setShape}
          placeholder="e.g. DFD, Flat, Kinked..."
          placeholderTextColor={palette.gray[400]}
        />
      </View>

      <View style={styles.dimensionsRow}>
        <View style={styles.dimField}>
          <FieldLabel label="Length" />
          <TextInput
            style={styles.input}
            accessibilityLabel="Length"
            value={length}
            onChangeText={setLength}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={palette.gray[400]}
          />
        </View>
        <View style={styles.dimField}>
          <FieldLabel label="Height" />
          <TextInput
            style={styles.input}
            accessibilityLabel="Height"
            value={height}
            onChangeText={setHeight}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={palette.gray[400]}
          />
        </View>
        <View style={styles.dimField}>
          <FieldLabel label="Width" />
          <TextInput
            style={styles.input}
            accessibilityLabel="Width"
            value={width}
            onChangeText={setWidth}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={palette.gray[400]}
          />
        </View>
      </View>

      <View style={styles.field}>
        <FieldLabel label="Material" />
        <ChipGroup>
          {materials.map((m) => (
            <Chip
              key={m}
              label={m.replace(/_/g, ' ')}
              selected={material === m}
              onPress={() => setMaterial(material === m ? undefined : m)}
            />
          ))}
        </ChipGroup>
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel} accessibilityElementsHidden importantForAccessibility="no">
          Skate stops
        </Text>
        <Switch
          accessibilityLabel="Skate stops"
          value={isStopped}
          onValueChange={setIsStopped}
          trackColor={{ true: palette.blue[500] }}
        />
      </View>

      {isStopped ? (
        <>
          <View style={styles.field}>
            <FieldLabel label="Stop type" />
            <ChipGroup>
              {stopTypes.map((t) => (
                <Chip
                  key={t}
                  label={STOP_TYPE_LABELS[t]}
                  selected={stopType === t}
                  onPress={() => setStopType(stopType === t ? undefined : t)}
                />
              ))}
            </ChipGroup>
          </View>
          <View style={styles.field}>
            <FieldLabel label="Stop details" />
            <TextInput
              style={styles.input}
              accessibilityLabel="Stop details"
              value={stopDetails}
              onChangeText={setStopDetails}
              placeholder="Knobbed at kinks"
              placeholderTextColor={palette.gray[400]}
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel} accessibilityElementsHidden importantForAccessibility="no">
              Removable with tools
            </Text>
            <Switch
              accessibilityLabel="Removable with tools"
              value={removable}
              onValueChange={setRemovable}
              trackColor={{ true: palette.blue[500] }}
            />
          </View>
        </>
      ) : null}

      <View style={styles.field}>
        <FieldLabel label="Difficulty" />
        <StarRating value={difficulty} onChange={setDifficulty} />
      </View>

      {/* In-Run */}
      <SectionHeader title="In-Run" />
      <View style={styles.field}>
        <FieldLabel label="Natural Speed" />
        <StarRating value={naturalSpeed} onChange={setNaturalSpeed} />
      </View>

      {/* Landing */}
      <SectionHeader title="Landing" />
      <View style={styles.field}>
        <FieldLabel label="Difficulty" />
        <StarRating value={landingDifficulty} onChange={setLandingDifficulty} />
      </View>
      <View style={styles.field}>
        <FieldLabel label="Surface" />
        <ChipGroup>
          {surfaces.map((s) => (
            <Chip
              key={s}
              label={s.replace(/_/g, ' ')}
              selected={landingSurface === s}
              onPress={() => setLandingSurface(landingSurface === s ? undefined : s)}
            />
          ))}
        </ChipGroup>
      </View>

      {/* Metadata */}
      <SectionHeader title="Details" />
      <View style={styles.field}>
        <FieldLabel label="Intensity" />
        <StarRating value={intensity} onChange={setIntensity} />
      </View>
      <View style={styles.field}>
        <FieldLabel label="Bustability" />
        <StarRating value={bustability} onChange={setBustability} />
      </View>
      <View style={styles.field}>
        <FieldLabel label="Bust Notes" />
        <TextInput
          style={[styles.input, styles.multiline]}
          value={bustNotes}
          onChangeText={setBustNotes}
          placeholder="Security patrols, neighbors..."
          placeholderTextColor={palette.gray[400]}
          multiline
        />
      </View>
      <View style={styles.field}>
        <FieldLabel label="Notes" />
        <TextInput
          style={[styles.input, styles.multiline]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Additional notes..."
          placeholderTextColor={palette.gray[400]}
          multiline
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
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  switchLabel: {
    flexShrink: 1,
    marginRight: spacing.sm,
    fontSize: 16,
    color: palette.gray[900],
    fontWeight: '500',
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  dimensionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dimField: {
    flex: 1,
    gap: spacing.xs,
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing['2xl'],
  },
});
