import React, { memo } from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { RatingBadge } from './RatingBadge';
import { palette, spacing, radius } from '@/src/constants/theme';

interface SpotListItemProps {
  id: string;
  displayName: string;
  thumbnailUri?: string;
  featureType?: string;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  distance?: string;
  isDraft: boolean;
  onPress: (id: string) => void;
}

export const SpotListItem = memo(function SpotListItem({
  id,
  displayName,
  thumbnailUri,
  featureType,
  difficulty,
  distance,
  isDraft,
  onPress,
}: SpotListItemProps) {
  return (
    <Pressable
      onPress={() => onPress(id)}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={displayName}>
      <View style={styles.thumbnailContainer}>
        {thumbnailUri ? (
          <Image
            source={{ uri: thumbnailUri }}
            style={styles.thumbnail}
            contentFit="cover"
            recyclingKey={id}
          />
        ) : (
          <View style={[styles.thumbnail, styles.placeholderThumb]}>
            <Text style={styles.placeholderText}>No Photo</Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={2}>
          {displayName}
        </Text>

        <View style={styles.badgeRow}>
          {featureType ? (
            <View style={styles.typeBadge}>
              <Text style={styles.typeText}>{featureType}</Text>
            </View>
          ) : null}
          {difficulty ? <RatingBadge rating={difficulty} /> : null}
          {isDraft ? (
            <View style={styles.draftBadge}>
              <Text style={styles.draftText}>Draft</Text>
            </View>
          ) : null}
        </View>

        {distance ? <Text style={styles.distance}>{distance}</Text> : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.md,
    backgroundColor: palette.white,
  },
  pressed: {
    backgroundColor: palette.gray[50],
  },
  thumbnailContainer: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  thumbnail: {
    width: 72,
    height: 72,
  },
  placeholderThumb: {
    backgroundColor: palette.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 11,
    color: palette.gray[400],
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.xs,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.gray[900],
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  typeBadge: {
    backgroundColor: palette.gray[100],
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
  },
  typeText: {
    fontSize: 12,
    fontWeight: '500',
    color: palette.gray[600],
    textTransform: 'capitalize',
  },
  draftBadge: {
    backgroundColor: palette.yellow[100],
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
  },
  draftText: {
    fontSize: 12,
    fontWeight: '500',
    color: palette.yellow[700],
  },
  distance: {
    fontSize: 13,
    color: palette.gray[500],
  },
});
