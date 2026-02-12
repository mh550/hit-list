import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { palette, spacing } from '@/src/constants/theme';
import { Button } from './Button';

import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof IconSymbol>['name'];

interface EmptyStateProps {
  icon?: IconName;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon = 'mappin.slash',
  title,
  message,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View style={styles.container} accessibilityRole="text">
      <IconSymbol name={icon} size={48} color={palette.gray[300]} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} variant="primary" size="md" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
    gap: spacing.sm,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: palette.gray[900],
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: palette.gray[500],
    textAlign: 'center',
    lineHeight: 22,
  },
});
