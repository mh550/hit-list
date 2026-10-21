import { useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';

import { useSpotsStore } from '@/src/stores';
import { Chip, ChipGroup } from '@/src/components/Chip';
import { SegmentedControl } from '@/src/components/SegmentedControl';
import { SpeedScale } from '@/src/components/SpeedScale';
import { palette, spacing, radius } from '@/src/constants/theme';
import { FEATURE_TYPE_LABELS } from '@/src/constants/labels';
import { FeatureType, DEFAULT_FILTERS } from '@/src/types';
import type { SpotFilters } from '@/src/types';
import type { SpeedRange } from '@/src/utils/speed-range';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type StoppedChoice = 'any' | 'not-stopped' | 'stopped';

const STOPPED_SEGMENTS = [
  { label: 'Any', value: 'any' },
  { label: 'Not stopped', value: 'not-stopped' },
  { label: 'Stopped', value: 'stopped' },
] as const;

const STOPPED_CHOICE = { any: undefined, 'not-stopped': false, stopped: true } as const;

function stoppedChoice(stopped: boolean | undefined): StoppedChoice {
  if (stopped === undefined) return 'any';
  return stopped ? 'stopped' : 'not-stopped';
}

/** A stored range may have one open end; the scale shows it running to that end of the scale. */
function speedRange({ natural_speed_min: min, natural_speed_max: max }: SpotFilters): SpeedRange | undefined {
  if (min === undefined && max === undefined) return undefined;
  return [min ?? 0, max ?? 4];
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={styles.sectionHeader} accessibilityRole="header">
      {title}
    </Text>
  );
}

export function FilterSheet({ visible, onClose }: Props) {
  // The sheet is unmounted while hidden, so the pending filters below re-initialise from the store on
  // every open without an effect.
  if (!visible) return null;
  return <FilterSheetContent onClose={onClose} />;
}

function FilterSheetContent({ onClose }: Omit<Props, 'visible'>) {
  const setFilters = useSpotsStore((s) => s.setFilters);
  const resetFilters = useSpotsStore((s) => s.resetFilters);

  // Pending filters, seeded once per open and only committed on Apply
  const [pending, setPending] = useState<SpotFilters>(() => useSpotsStore.getState().filters);

  const toggleType = (t: FeatureType) => {
    setPending((prev) => ({
      ...prev,
      types: prev.types.includes(t)
        ? prev.types.filter((x) => x !== t)
        : [...prev.types, t],
    }));
  };

  // Every key is written, even as undefined, so Apply's merge clears an old stopped value or range.
  const setStopped = (choice: StoppedChoice) => {
    setPending((prev) => ({ ...prev, stopped: STOPPED_CHOICE[choice] }));
  };

  const setSpeedRange = (range: SpeedRange | undefined) => {
    setPending((prev) => ({ ...prev, natural_speed_min: range?.[0], natural_speed_max: range?.[1] }));
  };

  const handleApply = () => {
    setFilters(pending);
    onClose();
  };

  const handleReset = () => {
    resetFilters();
    setPending({ ...DEFAULT_FILTERS });
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
          <Text style={styles.title} accessibilityRole="header">
            Filters
          </Text>
          <Pressable onPress={handleReset} hitSlop={8}>
            <Text style={styles.resetText}>Reset</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <SectionHeader title="What's here" />
          <ChipGroup>
            {Object.values(FeatureType).map((t) => (
              <Chip
                key={t}
                label={FEATURE_TYPE_LABELS[t]}
                selected={pending.types.includes(t)}
                onPress={() => toggleType(t)}
              />
            ))}
          </ChipGroup>

          <SectionHeader title="Skate stopped" />
          <SegmentedControl
            segments={STOPPED_SEGMENTS}
            selectedValue={stoppedChoice(pending.stopped)}
            onValueChange={setStopped}
          />

          <SectionHeader title="Natural speed" />
          <SpeedScale rangeValue={speedRange(pending)} onRangeChange={setSpeedRange} />
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
