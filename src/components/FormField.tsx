import React from 'react';
import { View, Text, TextInput, StyleSheet, type TextInputProps } from 'react-native';
import { palette, spacing, radius } from '@/src/constants/theme';

// ── FormField ───────────────────────────────────────────

interface FormFieldProps {
  label: string;
  children: React.ReactNode;
  error?: string;
}

export function FormField({ label, children, error }: FormFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

// ── FormInput ───────────────────────────────────────────

interface FormInputProps extends TextInputProps {
  label: string;
  error?: string;
}

export function FormInput({ label, error, style, ...props }: FormInputProps) {
  return (
    <FormField label={label} error={error}>
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
    gap: spacing.xs,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: palette.gray[700],
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
