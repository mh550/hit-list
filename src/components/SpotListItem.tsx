import React, { memo } from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { palette, spacing, radius } from '@/src/constants/theme';
import type { NaturalSpeed } from '@/src/types';
import { SPEED_LABELS } from '@/src/constants/labels';
import { Tag } from '@/src/components/Chip';
import { SpeedScale } from '@/src/components/SpeedScale';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface SpotListItemProps {
  id: string;
  displayName: string;
  thumbnailUri?: string;
  featureType?: string;
  stopped: boolean;
  naturalSpeed?: NaturalSpeed;
  distance?: string;
  onPress: (id: string) => void;
  onLongPress?: (id: string) => void;
  /** Select mode: the row is a checkbox (a check circle left of the thumbnail) and a tap toggles it. */
  selectable?: boolean;
  selected?: boolean;
}

export const SpotListItem = memo(function SpotListItem({
  id,
  displayName,
  thumbnailUri,
  featureType,
  stopped,
  naturalSpeed,
  distance,
  onPress,
  onLongPress,
  selectable = false,
  selected = false,
}: SpotListItemProps) {
  // VoiceOver reads only the row's label, not the badges inside it, so the label says what they show.
  const label = [
    displayName,
    featureType,
    stopped ? 'Skate stopped' : undefined,
    naturalSpeed === undefined ? undefined : `Natural speed: ${SPEED_LABELS[naturalSpeed].label}`,
    distance,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={() => onPress(id)}
      onLongPress={onLongPress ? () => onLongPress(id) : undefined}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      accessibilityRole={selectable ? 'checkbox' : 'button'}
      accessibilityState={selectable ? { checked: selected } : undefined}
      accessibilityLabel={label}>
      {selectable ? (
        <View testID={`spot-check-${id}`} style={[styles.check, selected && styles.checkSelected]}>
          {selected ? <IconSymbol name="checkmark" size={16} color={palette.white} /> : null}
        </View>
      ) : null}
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
          {featureType ? <Tag label={featureType} size="small" /> : null}
          {stopped ? <Tag label="Stopped" tone="stopped" size="small" /> : null}
          <SpeedScale readonly compact value={naturalSpeed} />
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
  check: {
    alignSelf: 'center',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: palette.gray[400],
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkSelected: {
    borderColor: palette.blue[500],
    backgroundColor: palette.blue[500],
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
  // Wraps rather than squeezing; the distance sits on its own line below, so a second badge line never hides it.
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  distance: {
    fontSize: 13,
    color: palette.gray[500],
  },
});
