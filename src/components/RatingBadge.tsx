import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ratingColors, radius, spacing } from '@/src/constants/theme';

interface RatingBadgeProps {
  rating: 1 | 2 | 3 | 4 | 5;
  label?: string;
}

export function RatingBadge({ rating, label }: RatingBadgeProps) {
  const colors = ratingColors[rating];

  return (
    <View
      style={[styles.container, { backgroundColor: colors.bg }]}
      accessibilityLabel={label ? `${label}: ${rating}` : `Rating: ${rating}`}
      accessibilityRole="text">
      <Text style={[styles.text, { color: colors.text }]}>
        {label ? `${label} ${rating}` : String(rating)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
  },
});
