import React from 'react';
import { View, Text, TextInput, StyleSheet, type TextInputProps } from 'react-native';
import { palette, spacing, radius } from '@/src/constants/theme';

// ── FormField ───────────────────────────────────────────

interface FormFieldProps {
  /** Omitted: just the control (its placeholder says what it is). */
  label?: string;
  /** The control carries the same accessibilityLabel, so VoiceOver skips the visible Text (one stop per control). */
  hideLabel?: boolean;
  children: React.ReactNode;
  error?: string;
}

export function FormField({ label, hideLabel, children, error }: FormFieldProps) {
  return (
    <View style={styles.field}>
      {label ? (
        <Text
          style={styles.label}
          accessibilityElementsHidden={hideLabel}
          importantForAccessibility={hideLabel ? 'no' : undefined}>
          {label}
        </Text>
      ) : null}
      {children}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

// ── FormInput ───────────────────────────────────────────

interface FormInputProps extends TextInputProps, Pick<FormFieldProps, 'label' | 'hideLabel' | 'error'> {
  ref?: React.Ref<TextInput>;
}

export function FormInput({ label, hideLabel, error, style, ...props }: FormInputProps) {
  return (
    <FormField label={label} hideLabel={hideLabel} error={error}>
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor={palette.gray[400]}
        {...props}
      />
    </FormField>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.sm,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.gray[600],
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
  },
  error: {
    fontSize: 13,
    color: palette.red[500],
  },
});
