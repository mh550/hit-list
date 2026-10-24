import { Pressable, StyleSheet, Text } from 'react-native';

import { palette, spacing } from '@/src/constants/theme';

interface Props {
  /** The visible text. */
  children: string;
  onPress: () => void;
  /** Defaults to the text. */
  accessibilityLabel?: string;
  /** Bold text, e.g. 'Filter (2)' while filters are on. */
  emphasized?: boolean;
}

/** A blue text button for a navigation header ('Filter', 'Select', 'Cancel', 'Rename'). */
export function HeaderTextButton({ children, onPress, accessibilityLabel, emphasized = false }: Props) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityRole="button"
      style={styles.button}>
      <Text style={[styles.text, emphasized && styles.textEmphasized]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: spacing.sm,
  },
  text: {
    fontSize: 16,
    color: palette.blue[500],
    fontWeight: '500',
  },
  textEmphasized: {
    fontWeight: '700',
  },
});
