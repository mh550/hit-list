import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { palette, spacing, radius } from '@/src/constants/theme';

// ── Chip ────────────────────────────────────────────────

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** 'checkbox' (default) for toggles in a set; 'button' for one-of choices such as the sort chips. */
  role?: 'checkbox' | 'button';
  disabled?: boolean;
  accessibilityLabel?: string;
}

export function Chip({
  label,
  selected = false,
  onPress,
  role = 'checkbox',
  disabled = false,
  accessibilityLabel,
}: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled]}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={role === 'button' ? { selected, disabled } : { checked: selected, disabled }}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ── ChipGroup ───────────────────────────────────────────

interface ChipGroupProps {
  children: React.ReactNode;
}

export function ChipGroup({ children }: ChipGroupProps) {
  return <View style={styles.group}>{children}</View>;
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderCurve: 'continuous',
    backgroundColor: palette.gray[100],
    borderWidth: 1,
    borderColor: palette.gray[200],
  },
  chipSelected: {
    backgroundColor: palette.blue[500],
    borderColor: palette.blue[500],
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.gray[700],
  },
  chipTextSelected: {
    color: palette.white,
  },
  group: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
