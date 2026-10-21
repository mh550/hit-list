import { useState } from 'react';
import { StyleSheet, ScrollView, View, Text, TextInput, Pressable } from 'react-native';

import { useSettingsStore } from '@/src/stores/settings-store';
import { useSettingsActions } from '@/src/hooks/use-settings-actions';
import { palette, spacing, radius } from '@/src/constants/theme';
import { UnitSystem } from '@/src/types';
import { radiusFromInput, radiusToDisplay, radiusUnitLabel } from '@/src/utils/units';

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

export default function ProfileScreen() {
  const units = useSettingsStore((s) => s.units);
  const batchRadius = useSettingsStore((s) => s.batch_import_radius);
  const { setUnits, setBatchImportRadius } = useSettingsActions();

  // D23: the radius is stored in metres; the field shows it in the user's unit. `typed` holds the text only while
  // the user is typing, so a units switch or a store update re-renders the field from the stored metres.
  const [typed, setTyped] = useState<string | null>(null);
  const radiusText = typed ?? String(radiusToDisplay(batchRadius, units));

  const commitRadius = () => {
    if (typed === null) return;
    setTyped(null);
    const radiusMeters = radiusFromInput(typed, units);
    if (radiusMeters !== null && radiusMeters !== batchRadius) setBatchImportRadius(radiusMeters);
  };

  // Taps keep the keyboard up (keyboardShouldPersistTaps), so text typed in one unit is saved before the switch.
  const switchUnits = (next: UnitSystem) => {
    commitRadius();
    setUnits(next);
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
          onPress={() => switchUnits(UnitSystem.Imperial)}
          accessibilityRole="button"
          accessibilityState={{ selected: units === UnitSystem.Imperial }}>
          <Text
            style={[styles.unitText, units === UnitSystem.Imperial && styles.unitTextActive]}>
            Imperial
          </Text>
        </Pressable>
        <Pressable
          style={[styles.unitButton, units === UnitSystem.Metric && styles.unitButtonActive]}
          onPress={() => switchUnits(UnitSystem.Metric)}
          accessibilityRole="button"
          accessibilityState={{ selected: units === UnitSystem.Metric }}>
          <Text
            style={[styles.unitText, units === UnitSystem.Metric && styles.unitTextActive]}>
            Metric
          </Text>
        </Pressable>
      </View>

      <SectionHeader title="Import Settings" />
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Import radius · {radiusUnitLabel(units)}</Text>
        <Text style={styles.fieldHint}>
          Photos this close together import as one spot, and a new spot this close to one you have offers to join it.
        </Text>
        <TextInput
          style={styles.input}
          value={radiusText}
          onChangeText={setTyped}
          onBlur={commitRadius}
          keyboardType="number-pad"
          returnKeyType="done"
          onSubmitEditing={commitRadius}
          accessibilityLabel={units === UnitSystem.Imperial ? 'Import radius in feet' : 'Import radius in metres'}
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
