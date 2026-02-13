import { useState } from 'react';
import { StyleSheet, ScrollView, View, Text, TextInput, Pressable } from 'react-native';

import { useSettingsStore } from '@/src/stores/settings-store';
import { useSettingsActions } from '@/src/hooks/use-settings-actions';
import { Chip, ChipGroup } from '@/src/components/Chip';
import { palette, spacing, radius } from '@/src/constants/theme';
import { GearItem, UnitSystem } from '@/src/types';

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

const GEAR_LABELS: Record<GearItem, string> = {
  [GearItem.Winch]: 'winch',
  [GearItem.Bungee]: 'bungee',
  [GearItem.DropInPlatform]: 'drop in platform',
  [GearItem.Scaffolding]: 'scaffolding',
  [GearItem.ShovelPull]: 'shovel pull',
};

export default function ProfileScreen() {
  const units = useSettingsStore((s) => s.units);
  const batchRadius = useSettingsStore((s) => s.batch_import_radius);
  const gear = useSettingsStore((s) => s.gear);
  const { setUnits, setBatchImportRadius, toggleGear } = useSettingsActions();

  const [radiusText, setRadiusText] = useState(String(batchRadius));

  const handleRadiusBlur = () => {
    const parsed = parseInt(radiusText, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setBatchImportRadius(parsed);
    } else {
      setRadiusText(String(batchRadius));
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <SectionHeader title="Units" />
      <View style={styles.unitsRow}>
        <Pressable
          style={[styles.unitButton, units === UnitSystem.Imperial && styles.unitButtonActive]}
          onPress={() => setUnits(UnitSystem.Imperial)}
          accessibilityRole="button"
          accessibilityState={{ selected: units === UnitSystem.Imperial }}>
          <Text
            style={[styles.unitText, units === UnitSystem.Imperial && styles.unitTextActive]}>
            Imperial
          </Text>
        </Pressable>
        <Pressable
          style={[styles.unitButton, units === UnitSystem.Metric && styles.unitButtonActive]}
          onPress={() => setUnits(UnitSystem.Metric)}
          accessibilityRole="button"
          accessibilityState={{ selected: units === UnitSystem.Metric }}>
          <Text
            style={[styles.unitText, units === UnitSystem.Metric && styles.unitTextActive]}>
            Metric
          </Text>
        </Pressable>
      </View>

      <SectionHeader title="My Gear" />
      <Text style={styles.hint}>Select the gear you own for smart spot filtering.</Text>
      <ChipGroup>
        {Object.values(GearItem).map((item) => (
          <Chip
            key={item}
            label={GEAR_LABELS[item]}
            selected={gear.includes(item)}
            onPress={() => toggleGear(item)}
          />
        ))}
      </ChipGroup>

      <SectionHeader title="Import Settings" />
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Import Radius</Text>
        <Text style={styles.fieldHint}>
          Photos within this distance (meters) will be grouped as one spot during batch import.
        </Text>
        <TextInput
          style={styles.input}
          value={radiusText}
          onChangeText={setRadiusText}
          onBlur={handleRadiusBlur}
          keyboardType="number-pad"
          returnKeyType="done"
          onSubmitEditing={handleRadiusBlur}
          accessibilityLabel="Import radius in meters"
        />
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
    paddingBottom: spacing['3xl'],
    gap: spacing.md,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.gray[900],
    marginTop: spacing.lg,
  },
  hint: {
    fontSize: 13,
    color: palette.gray[500],
  },
  unitsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  unitButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: palette.gray[300],
    alignItems: 'center',
    backgroundColor: palette.white,
  },
  unitButtonActive: {
    borderColor: palette.blue[500],
    backgroundColor: palette.blue[500] + '15',
  },
  unitText: {
    fontSize: 15,
    fontWeight: '500',
    color: palette.gray[600],
  },
  unitTextActive: {
    color: palette.blue[500],
    fontWeight: '600',
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: palette.gray[700],
  },
  fieldHint: {
    fontSize: 13,
    color: palette.gray[500],
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
    width: 100,
  },
});
