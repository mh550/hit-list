import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { palette, spacing, radius } from '@/src/constants/theme';

interface Segment {
  label: string;
  value: string;
}

interface SegmentedControlProps {
  segments: Segment[];
  selectedValue: string;
  onValueChange: (value: string) => void;
}

export function SegmentedControl({
  segments,
  selectedValue,
  onValueChange,
}: SegmentedControlProps) {
  return (
    <View style={styles.container} accessibilityRole="tablist">
      {segments.map((segment) => {
        const selected = segment.value === selectedValue;
        return (
          <Pressable
            key={segment.value}
            onPress={() => onValueChange(segment.value)}
            style={[styles.segment, selected && styles.selectedSegment]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}>
            <Text style={[styles.label, selected && styles.selectedLabel]}>
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: palette.gray[100],
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.md - 2,
    borderCurve: 'continuous',
  },
  selectedSegment: {
    backgroundColor: palette.white,
    shadowColor: palette.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: palette.gray[500],
  },
  selectedLabel: {
    color: palette.gray[900],
    fontWeight: '600',
  },
});
