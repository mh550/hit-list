import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, radius, spacing } from '@/src/constants/theme';
import { useToastStore } from '@/src/stores/toast-store';

/** Clears the tab bar (49 pt on iPhone) above the home indicator. */
const ABOVE_TAB_BAR = 49 + spacing.md;

/**
 * The toast line (src/stores/toast-store.ts), just above the tab bar; it never takes a touch. The root layout draws
 * one over the stack; a native full-screen modal (the area picker) covers that, so it draws its own. showToast
 * announces the line, so no live region here.
 */
export function ToastHost() {
  const text = useToastStore((s) => s.text);
  const insets = useSafeAreaInsets();

  if (!text) return null;
  return (
    <View pointerEvents="none" style={[styles.host, { bottom: insets.bottom + ABOVE_TAB_BAR }]}>
      <View style={styles.toast} accessible accessibilityRole="alert">
        <Text style={styles.text}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
  },
  toast: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    backgroundColor: palette.gray[900],
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.white,
  },
});
