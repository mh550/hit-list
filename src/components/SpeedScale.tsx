import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { palette, spacing, radius, typography } from '@/src/constants/theme';
import { SPEED_LABELS } from '@/src/constants/labels';
import type { NaturalSpeed } from '@/src/types';

const LEVELS: readonly NaturalSpeed[] = [0, 1, 2, 3, 4];

interface SpeedScaleProps {
  /** undefined = not rated; 0 (None) is a real value. */
  value?: NaturalSpeed;
  onChange?: (value: NaturalSpeed | undefined) => void;
  /** Compact five-cell bar with the word beside it; renders nothing when not rated. */
  readonly?: boolean;
}

export function SpeedScale({ value, onChange, readonly }: SpeedScaleProps) {
  if (readonly) {
    if (value === undefined) return null;
    const { label } = SPEED_LABELS[value];
    return (
      <View style={styles.bar} accessible accessibilityLabel={`Natural speed: ${label}`}>
        <View style={styles.cells}>
          {LEVELS.map((level) => {
            const filled = level <= value;
            return (
              <View
                key={level}
                testID={`speed-cell-${level}`}
                accessibilityState={{ selected: filled }}
                style={[styles.cell, filled && styles.filled]}
              />
            );
          })}
        </View>
        <Text style={styles.barLabel}>{label}</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.row} accessibilityRole="radiogroup">
        {LEVELS.map((level) => {
          const checked = level === value;
          const { label, description } = SPEED_LABELS[level];
          return (
            <Pressable
              key={level}
              onPress={() => onChange?.(checked ? undefined : level)}
              style={[styles.segment, checked && styles.filled]}
              accessibilityRole="radio"
              accessibilityState={{ checked }}
              accessibilityHint={checked ? 'Double-tap to clear the rating.' : undefined}
              accessibilityLabel={`${label}: ${description}`}>
              <Text
                style={[styles.segmentLabel, checked && styles.selectedLabel]}
                numberOfLines={level === 4 ? 2 : 1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.description}>
        {value === undefined ? 'Not rated' : SPEED_LABELS[value].description}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 2,
    backgroundColor: palette.gray[100],
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: 2,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md - 2,
    borderCurve: 'continuous',
    backgroundColor: palette.gray[100],
  },
  filled: {
    backgroundColor: palette.blue[500],
  },
  segmentLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: palette.gray[700],
    textAlign: 'center',
  },
  selectedLabel: {
    color: palette.white,
    fontWeight: '600',
  },
  description: {
    ...typography.footnote,
    color: palette.gray[500],
    marginTop: spacing.xs,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cells: {
    flexDirection: 'row',
    gap: 2,
  },
  cell: {
    width: 12,
    height: 8,
    borderRadius: 2,
    backgroundColor: palette.gray[200],
  },
  barLabel: {
    ...typography.subheadline,
    color: palette.gray[700],
  },
});
