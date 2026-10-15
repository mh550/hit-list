import { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
} from 'react-native';

import { useSpotsStore } from '@/src/stores';
import { useSettingsStore } from '@/src/stores/settings-store';
import { useSpotActions } from '@/src/hooks/use-spot-actions';
import { getSpotDisplayName } from '@/src/utils/spot-name';
import { metersToDisplay, inputToMeters } from '@/src/utils/units';
import { StarRating } from '@/src/components/StarRating';
import { Chip, ChipGroup } from '@/src/components/Chip';
import { Button } from '@/src/components/Button';
import { palette, spacing, radius } from '@/src/constants/theme';
import {
  SpotStatus,
  FeatureType,
  Material,
  LandingSurface,
  GearItem,
  BuildItem,
} from '@/src/types';
import type { SpotUpdate, SetupOption, Requirement } from '@/src/types';

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
  const units = useSettingsStore((s) => s.units);

  // Edit state (local copy)
  const [name, setName] = useState(spot?.name ?? '');
  const [featureType, setFeatureType] = useState(spot?.feature.type);
  const [customType, setCustomType] = useState(spot?.feature.custom_type ?? '');
  const [shape, setShape] = useState(spot?.feature.shape ?? '');
  const [length, setLength] = useState(
    spot?.feature.dimensions?.length != null
      ? metersToDisplay(spot.feature.dimensions.length, units).toFixed(1)
      : '',
  );
  const [height, setHeight] = useState(
    spot?.feature.dimensions?.height != null
      ? metersToDisplay(spot.feature.dimensions.height, units).toFixed(1)
      : '',
  );
  const [width, setWidth] = useState(
    spot?.feature.dimensions?.width != null
      ? metersToDisplay(spot.feature.dimensions.width, units).toFixed(1)
      : '',
  );
  const [material, setMaterial] = useState(spot?.feature.material);
  const [difficulty, setDifficulty] = useState(spot?.feature.difficulty ?? 0);
  const [naturalSpeed, setNaturalSpeed] = useState(spot?.in_run.natural_speed ?? 0);
  const [setupOptions, setSetupOptions] = useState<SetupOption[]>(
    spot?.in_run.setup_options ?? [],
  );
  const [landingDifficulty, setLandingDifficulty] = useState(spot?.landing.difficulty ?? 0);
  const [landingSurface, setLandingSurface] = useState(spot?.landing.surface);
  const [intensity, setIntensity] = useState(spot?.metadata.intensity ?? 0);
  const [bustability, setBustability] = useState(spot?.metadata.bustability ?? 0);
  const [bustNotes, setBustNotes] = useState(spot?.metadata.bustability_notes ?? '');
  const [notes, setNotes] = useState(spot?.metadata.notes ?? '');
  const [status, setStatus] = useState(spot?.status ?? SpotStatus.Draft);

  const handleSave = useCallback(async () => {
    if (!spot) return;

    const updates: SpotUpdate = {
      name: name.trim() || null, // null clears the stored name; undefined would keep the old one
      status,
      feature: {
        type: featureType,
        custom_type: featureType === FeatureType.Other ? customType : undefined,
        shape: shape || undefined,
        dimensions: {
          length: length ? inputToMeters(parseFloat(length), units) : undefined,
          height: height ? inputToMeters(parseFloat(height), units) : undefined,
          width: width ? inputToMeters(parseFloat(width), units) : undefined,
        },
        material,
        difficulty: difficulty || undefined,
      },
      in_run: {
        natural_speed: naturalSpeed || undefined,
        setup_options: setupOptions,
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

    await updateSpot(spot.id, updates);
    router.back();
  }, [
    spot, name, status, featureType, customType, shape, length, height, width,
    material, difficulty, naturalSpeed, setupOptions, landingDifficulty,
    landingSurface, intensity, bustability, bustNotes, notes, units,
    updateSpot, router,
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

  const addSetupOption = useCallback(() => {
    setSetupOptions((prev) => [...prev, { requires: [] }]);
  }, []);

  const removeSetupOption = useCallback((index: number) => {
    setSetupOptions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const toggleRequirement = useCallback(
    (optionIndex: number, item: GearItem | BuildItem, category: 'gear' | 'build') => {
      setSetupOptions((prev) =>
        prev.map((opt, i) => {
          if (i !== optionIndex) return opt;
          const exists = opt.requires.find((r) => r.item === item);
          if (exists) {
            return { requires: opt.requires.filter((r) => r.item !== item) };
          }
          const req: Requirement = { item, category };
          return { requires: [...opt.requires, req] };
        }),
      );
    },
    [],
  );

  if (!spot) {
    return (
      <View style={styles.centered}>
        <Text>Spot not found</Text>
      </View>
    );
  }

  const featureTypes = Object.values(FeatureType);
  const materials = Object.values(Material);
  const surfaces = Object.values(LandingSurface);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
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

      <View style={styles.field}>
        <FieldLabel label="Setup Options" />
        {setupOptions.map((opt, optIdx) => (
          <View key={optIdx} style={styles.setupCard}>
            <View style={styles.setupHeader}>
              <Text style={styles.setupTitle}>Option {optIdx + 1}</Text>
              <Pressable onPress={() => removeSetupOption(optIdx)} hitSlop={8}>
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
            <Text style={styles.reqLabel}>Gear</Text>
            <ChipGroup>
              {Object.values(GearItem).map((g) => (
                <Chip
                  key={g}
                  label={g.replace(/_/g, ' ')}
                  selected={opt.requires.some((r) => r.item === g)}
                  onPress={() => toggleRequirement(optIdx, g, 'gear')}
                />
              ))}
            </ChipGroup>
            <Text style={styles.reqLabel}>Build</Text>
            <ChipGroup>
              {Object.values(BuildItem).map((b) => (
                <Chip
                  key={b}
                  label={b.replace(/_/g, ' ')}
                  selected={opt.requires.some((r) => r.item === b)}
                  onPress={() => toggleRequirement(optIdx, b, 'build')}
                />
              ))}
            </ChipGroup>
          </View>
        ))}
        <Button title="Add Setup Option" onPress={addSetupOption} variant="secondary" />
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

      {/* Status */}
      <SectionHeader title="Status" />
      <View style={styles.statusRow}>
        <Chip
          label="Draft"
          selected={status === SpotStatus.Draft}
          onPress={() => setStatus(SpotStatus.Draft)}
        />
        <Chip
          label="Complete"
          selected={status === SpotStatus.Complete}
          onPress={() => setStatus(SpotStatus.Complete)}
        />
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Button title="Save" onPress={handleSave} variant="primary" size="lg" />
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
  setupCard: {
    backgroundColor: palette.gray[50],
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: spacing.md,
    gap: spacing.sm,
  },
  setupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  setupTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.gray[700],
  },
  removeText: {
    fontSize: 14,
    color: palette.red[500],
    fontWeight: '500',
  },
  reqLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: palette.gray[500],
    textTransform: 'uppercase',
    marginTop: spacing.xs,
  },
  statusRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing['2xl'],
  },
});
