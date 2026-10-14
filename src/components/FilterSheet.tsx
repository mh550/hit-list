import { useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
  StyleSheet,
} from 'react-native';

import { useSpotsStore } from '@/src/stores';
import { Chip, ChipGroup } from '@/src/components/Chip';
import { palette, spacing, radius } from '@/src/constants/theme';
import { FeatureType, GearItem, BuildItem, DEFAULT_FILTERS } from '@/src/types';
import type { SpotFilters } from '@/src/types';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const TYPE_LABELS: Record<FeatureType, string> = {
  [FeatureType.Rail]: 'rail',
  [FeatureType.Ledge]: 'ledge',
  [FeatureType.Bank]: 'bank',
  [FeatureType.Hip]: 'hip',
  [FeatureType.StairSet]: 'stair set',
  [FeatureType.Gap]: 'gap',
  [FeatureType.WallRide]: 'wall ride',
  [FeatureType.QuarterPipe]: 'quarter pipe',
  [FeatureType.Other]: 'other',
};

const GEAR_LABELS: Record<GearItem, string> = {
  [GearItem.Winch]: 'winch',
  [GearItem.Bungee]: 'bungee',
  [GearItem.DropInPlatform]: 'drop in platform',
  [GearItem.Scaffolding]: 'scaffolding',
  [GearItem.ShovelPull]: 'shovel pull',
};

const BUILD_LABELS: Record<BuildItem, string> = {
  [BuildItem.SpeedHumps]: 'speed humps',
  [BuildItem.LipBuild]: 'lip build',
  [BuildItem.LandingBuild]: 'landing build',
};

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

export function FilterSheet({ visible, onClose }: Props) {
  // The sheet is unmounted while hidden, so the draft below re-initialises from the store on
  // every open without an effect.
  if (!visible) return null;
  return <FilterSheetContent onClose={onClose} />;
}

function FilterSheetContent({ onClose }: { onClose: () => void }) {
  const storeFilters = useSpotsStore((s) => s.filters);
  const setFilters = useSpotsStore((s) => s.setFilters);
  const resetFilters = useSpotsStore((s) => s.resetFilters);

  // Local draft state — only committed on Apply
  const [draft, setDraft] = useState<SpotFilters>({ ...storeFilters });

  const toggleType = (t: FeatureType) => {
    setDraft((prev) => ({
      ...prev,
      types: prev.types.includes(t)
        ? prev.types.filter((x) => x !== t)
        : [...prev.types, t],
    }));
  };

  const toggleGear = (g: GearItem) => {
    setDraft((prev) => ({
      ...prev,
      gear: prev.gear.includes(g)
        ? prev.gear.filter((x) => x !== g)
        : [...prev.gear, g],
    }));
  };

  const toggleExcludeBuild = (b: BuildItem) => {
    setDraft((prev) => ({
      ...prev,
      exclude_build: prev.exclude_build.includes(b)
        ? prev.exclude_build.filter((x) => x !== b)
        : [...prev.exclude_build, b],
    }));
  };

  const handleApply = () => {
    setFilters(draft);
    onClose();
  };

  const handleReset = () => {
    resetFilters();
    setDraft({ ...DEFAULT_FILTERS });
  };

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Filters</Text>
          <Pressable onPress={handleReset} hitSlop={8}>
            <Text style={styles.resetText}>Reset</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          {/* Feature Type */}
          <SectionHeader title="Feature Type" />
          <ChipGroup>
            {Object.values(FeatureType).map((t) => (
              <Chip
                key={t}
                label={TYPE_LABELS[t]}
                selected={draft.types.includes(t)}
                onPress={() => toggleType(t)}
              />
            ))}
          </ChipGroup>

          {/* Gear Filter */}
          <SectionHeader title="Gear I Have" />
          <Text style={styles.hint}>Show spots rideable with my gear.</Text>
          <ChipGroup>
            {Object.values(GearItem).map((g) => (
              <Chip
                key={g}
                label={GEAR_LABELS[g]}
                selected={draft.gear.includes(g)}
                onPress={() => toggleGear(g)}
              />
            ))}
          </ChipGroup>

          {/* Build Exclude */}
          <SectionHeader title="Exclude Build Requirements" />
          <Text style={styles.hint}>Hide spots that require these build items.</Text>
          <ChipGroup>
            {Object.values(BuildItem).map((b) => (
              <Chip
                key={b}
                label={BUILD_LABELS[b]}
                selected={draft.exclude_build.includes(b)}
                onPress={() => toggleExcludeBuild(b)}
              />
            ))}
          </ChipGroup>

          {/* Show Drafts */}
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Show Drafts</Text>
            <Switch
              value={draft.show_drafts}
              onValueChange={(v) => setDraft((prev) => ({ ...prev, show_drafts: v }))}
              trackColor={{ true: palette.blue[500] }}
            />
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [styles.applyButton, pressed && styles.applyPressed]}
            onPress={handleApply}
            accessibilityRole="button">
            <Text style={styles.applyText}>Apply</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.white,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.gray[200],
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.gray[900],
  },
  resetText: {
    fontSize: 16,
    color: palette.blue[500],
    fontWeight: '500',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
    gap: spacing.md,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.gray[900],
    marginTop: spacing.lg,
  },
  hint: {
    fontSize: 13,
    color: palette.gray[500],
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  switchLabel: {
    fontSize: 16,
    color: palette.gray[900],
    fontWeight: '500',
  },
  footer: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.gray[200],
  },
  applyButton: {
    backgroundColor: palette.blue[500],
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
  },
  applyPressed: {
    backgroundColor: palette.blue[600],
  },
  applyText: {
    color: palette.white,
    fontSize: 17,
    fontWeight: '600',
  },
});
