import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { Chip, ChipGroup } from './Chip';
import { SpeedScale } from './SpeedScale';
import { FEATURE_TYPE_LABELS } from '@/src/constants/labels';
import { palette, spacing } from '@/src/constants/theme';
import type { FeatureType, Spot } from '@/src/types';

export type SpotTags = Pick<Spot, 'feature_types' | 'stopped' | 'natural_speed'>;

interface SpotTagFieldsProps {
  value: SpotTags;
  /** Always called with the full next value. */
  onChange: (next: SpotTags) => void;
}

const FEATURE_TYPES = Object.entries(FEATURE_TYPE_LABELS) as [FeatureType, string][];

/** The three tags of a spot (spec §2.2 items 3–5): what's here, skate stopped, natural speed. Controlled. */
export function SpotTagFields({ value, onChange }: SpotTagFieldsProps) {
  const toggleType = (type: FeatureType) => {
    const feature_types = value.feature_types.includes(type)
      ? value.feature_types.filter((t) => t !== type)
      : [...value.feature_types, type]; // tap order kept (D19)
    onChange({ ...value, feature_types });
  };

  return (
    <View style={styles.container}>
      <View style={styles.field}>
        <Text style={styles.label}>What&apos;s here</Text>
        <ChipGroup>
          {FEATURE_TYPES.map(([type, label]) => (
            <Chip
              key={type}
              label={label}
              selected={value.feature_types.includes(type)}
              onPress={() => toggleType(type)}
            />
          ))}
        </ChipGroup>
      </View>

      <View style={styles.switchRow}>
        {/* The Switch carries the same label, so VoiceOver skips this Text. */}
        <Text style={styles.switchLabel} accessibilityElementsHidden importantForAccessibility="no">
          Skate stopped
        </Text>
        <Switch
          value={value.stopped}
          onValueChange={(stopped) => onChange({ ...value, stopped })}
          accessibilityLabel="Skate stopped"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Natural speed</Text>
        <SpeedScale
          value={value.natural_speed}
          onChange={(natural_speed) => onChange({ ...value, natural_speed })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  field: {
    gap: spacing.sm,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.gray[600],
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  switchLabel: {
    flexShrink: 1,
    fontSize: 16,
    color: palette.gray[900],
  },
});
