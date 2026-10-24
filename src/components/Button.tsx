import React from 'react';
import { Pressable, Text, StyleSheet, type ViewStyle, type TextStyle } from 'react-native';
import { spacing, radius, palette } from '@/src/constants/theme';

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  /** Working on it (VoiceOver says busy); pair with `disabled`. */
  busy?: boolean;
  accessibilityLabel?: string;
}

const sizeStyles: Record<ButtonSize, { container: ViewStyle; text: TextStyle }> = {
  sm: {
    container: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
    text: { fontSize: 14 },
  },
  md: {
    container: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
    text: { fontSize: 16 },
  },
  lg: {
    container: { paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
    text: { fontSize: 17 },
  },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  busy,
  accessibilityLabel,
}: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole="button"
      accessibilityState={busy === undefined ? undefined : { busy }}
      style={({ pressed }) => [
        styles.base,
        sizeStyles[size].container,
        variantBg[variant],
        pressed && variantPressed[variant],
        disabled && styles.disabled,
      ]}>
      <Text style={[styles.text, sizeStyles[size].text, variantText[variant]]}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
  text: {
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
});

const variantBg = StyleSheet.create({
  primary: { backgroundColor: palette.blue[500] },
  secondary: { backgroundColor: palette.gray[200] },
  destructive: { backgroundColor: palette.red[500] },
  ghost: { backgroundColor: 'transparent' },
});

const variantPressed = StyleSheet.create({
  primary: { backgroundColor: palette.blue[600] },
  secondary: { backgroundColor: palette.gray[300] },
  destructive: { backgroundColor: palette.red[700] },
  ghost: { backgroundColor: palette.gray[100] },
});

const variantText = StyleSheet.create({
  primary: { color: palette.white },
  secondary: { color: palette.gray[900] },
  destructive: { color: palette.white },
  ghost: { color: palette.blue[500] },
});
