import { Pressable, StyleSheet } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { palette, radius } from '@/src/constants/theme';

interface AddPhotosTileProps {
  onPress: () => void;
  disabled?: boolean;
}

/** The dashed '+' tile a `PhotoGrid` takes as `trailing`: 'Add photos' on detail (opens edit) and on edit (picker). */
export function AddPhotosTile({ onPress, disabled }: AddPhotosTileProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Add photos">
      <IconSymbol name="plus" size={28} color={palette.gray[500]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: palette.gray[300],
    borderRadius: radius.sm,
    borderCurve: 'continuous',
  },
  pressed: {
    backgroundColor: palette.gray[200],
  },
});
