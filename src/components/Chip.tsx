import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { palette, spacing, radius } from '@/src/constants/theme';

// ── Chip ────────────────────────────────────────────────

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /**
   * 'checkbox' (default) for toggles in a set; 'button' for one-of choices such as the sort chips; 'tab' for a row
   * that switches what the screen shows (the list picker); 'radio' for one value of a setting (the area radius).
   * 'button' and 'tab' report `selected`, 'checkbox' and 'radio' `checked`.
   */
  role?: 'checkbox' | 'button' | 'tab' | 'radio';
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function Chip({
  label,
  selected = false,
  onPress,
  role = 'checkbox',
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
}: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled]}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={
        role === 'checkbox' || role === 'radio' ? { checked: selected, disabled } : { selected, disabled }
      }>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ── Tag ─────────────────────────────────────────────────

interface TagProps {
  label: string;
  /** 'stopped' draws the red outline of the 'Skate stopped' tag. */
  tone?: 'default' | 'stopped';
  /** 'small' matches a list row's 12-pt badges. */
  size?: 'default' | 'small';
  testID?: string;
}

/** A read-only chip: no role and nothing to press, so VoiceOver reads it as text rather than a checkbox. */
export function Tag({ label, tone = 'default', size = 'default', testID }: TagProps) {
  const small = size === 'small';
  return (
    <View testID={testID} style={[styles.chip, small && styles.tagSmall, tone === 'stopped' && styles.tagStopped]}>
      <Text style={[styles.chipText, small && styles.tagSmallText, tone === 'stopped' && styles.tagStoppedText]}>
        {label}
      </Text>
    </View>
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
  tagSmall: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  tagSmallText: {
    fontSize: 12,
  },
  tagStopped: {
    backgroundColor: palette.white,
    borderColor: palette.red[500],
  },
  tagStoppedText: {
    color: palette.red[700],
  },
  group: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
