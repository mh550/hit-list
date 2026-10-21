import React, { useState } from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { palette, spacing, radius, typography } from '@/src/constants/theme';
import { SPEED_LABELS } from '@/src/constants/labels';
import { inSpeedRange, liveAnchor, nextSpeedRange, speedRangeLabel } from '@/src/utils/speed-range';
import type { SpeedRange } from '@/src/utils/speed-range';
import type { NaturalSpeed } from '@/src/types';

const LEVELS: readonly NaturalSpeed[] = [0, 1, 2, 3, 4];

interface SingleProps {
  /** undefined = not rated; 0 (None) is a real value. */
  value?: NaturalSpeed;
  onChange?: (value: NaturalSpeed | undefined) => void;
  /** Compact five-cell bar with the word beside it; renders nothing when not rated. */
  readonly?: boolean;
  /** Readonly only: a 12-pt word for a list row. */
  compact?: boolean;
  rangeValue?: never;
  onRangeChange?: never;
}

interface RangeProps {
  /** Filter sheet: undefined = Any; [a, a] = just a. */
  rangeValue?: SpeedRange;
  onRangeChange: (range: SpeedRange | undefined) => void;
  value?: never;
  onChange?: never;
  readonly?: never;
  compact?: never;
}

type SpeedScaleProps = SingleProps | RangeProps;

/** Range mode when `onRangeChange` is passed; otherwise the edit radios, or the bar when `readonly`. */
export function SpeedScale(props: SpeedScaleProps) {
  if (props.onRangeChange !== undefined) {
    return <SpeedRangePicker rangeValue={props.rangeValue} onRangeChange={props.onRangeChange} />;
  }
  if (props.readonly) return <SpeedBar value={props.value} compact={props.compact} />;
  return <SpeedPicker value={props.value} onChange={props.onChange} />;
}

function SpeedBar({ value, compact }: { value?: NaturalSpeed; compact?: boolean }) {
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
      <Text style={[styles.barLabel, compact && styles.barLabelCompact]}>{label}</Text>
    </View>
  );
}

function SegmentLabel({ level, filled }: { level: NaturalSpeed; filled: boolean }) {
  return (
    <Text style={[styles.segmentLabel, filled && styles.selectedLabel]} numberOfLines={level === 4 ? 2 : 1}>
      {SPEED_LABELS[level].label}
    </Text>
  );
}

function SpeedPicker({ value, onChange }: Pick<SingleProps, 'value' | 'onChange'>) {
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
              <SegmentLabel level={level} filled={checked} />
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

function rangeHint(range: SpeedRange | undefined, anchor: NaturalSpeed | undefined, level: NaturalSpeed) {
  if (anchor !== undefined) {
    return level === anchor ? 'Double-tap to select just this one' : 'Double-tap to end the range here';
  }
  return inSpeedRange(range, level) ? 'Double-tap to clear the range' : 'Double-tap to start a range here';
}

function SpeedRangePicker({ rangeValue, onRangeChange }: RangeProps) {
  // The first end of a range in progress. It counts only while the range is still [anchor, anchor], so a
  // Reset from outside drops it without an effect.
  const [anchorState, setAnchor] = useState<NaturalSpeed | undefined>(undefined);
  const anchor = liveAnchor(rangeValue, anchorState);

  const press = (level: NaturalSpeed) => {
    const next = nextSpeedRange(rangeValue, anchorState, level);
    setAnchor(next.anchor);
    onRangeChange(next.range);
  };

  const summary = speedRangeLabel(rangeValue);

  return (
    <View>
      <View style={styles.row}>
        {LEVELS.map((level) => {
          const selected = inSpeedRange(rangeValue, level);
          const { label, description } = SPEED_LABELS[level];
          return (
            <Pressable
              key={level}
              onPress={() => press(level)}
              style={[styles.segment, selected && styles.filled]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityHint={rangeHint(rangeValue, anchor, level)}
              accessibilityLabel={`${label}: ${description}`}>
              <SegmentLabel level={level} filled={selected} />
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.description} accessibilityLabel={`Natural speed: ${summary}`}>
        {summary}
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
  barLabelCompact: {
    ...typography.caption1,
  },
});
