import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { palette, spacing } from '@/src/constants/theme';

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
  readonly?: boolean;
}

export function StarRating({
  value,
  onChange,
  size = 24,
  readonly = false,
}: StarRatingProps) {
  return (
    <View
      style={styles.container}
      accessibilityLabel={`Rating: ${value} out of 5`}
      accessibilityRole="adjustable">
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          onPress={() => {
            if (!readonly && onChange) {
              onChange(star);
            }
          }}
          disabled={readonly}
          hitSlop={4}
          accessibilityLabel={`${star} star${star > 1 ? 's' : ''}`}>
          <IconSymbol
            name={star <= value ? 'star.fill' : 'star'}
            size={size}
            color={star <= value ? palette.yellow[500] : palette.gray[300]}
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
});
