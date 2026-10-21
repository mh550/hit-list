import type { ReactNode } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useDbInit } from '@/src/hooks/use-db-init';
import { colors, palette, spacing, typography } from '@/src/constants/theme';

interface Props {
  children: ReactNode;
}

export function DBInitializer({ children }: Props) {
  const { isReady, upgradeFailed } = useDbInit();

  if (!isReady) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={palette.blue[500]} />
      </View>
    );
  }

  // D28: this build cannot write to an older schema, so the app stays closed until a launch upgrades it.
  if (upgradeFailed) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>{"Couldn't upgrade your spots"}</Text>
        <Text style={styles.body}>
          Nothing was lost: your spots and photos are still on this phone. Close HitList and open it again to retry.
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  title: {
    ...typography.headline,
    color: colors.light.text,
    textAlign: 'center',
  },
  body: {
    ...typography.body,
    color: colors.light.textSecondary,
    textAlign: 'center',
  },
});
