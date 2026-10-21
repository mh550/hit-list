import React, { useState, type ReactNode } from 'react';
import { View, Pressable, PixelRatio, StyleSheet, type DimensionValue, type LayoutChangeEvent } from 'react-native';
import { Image } from 'expo-image';
import { palette, spacing, radius } from '@/src/constants/theme';
import { resolvePhotoUri } from '@/src/utils/photo-storage';
import type { Media } from '@/src/types';

interface PhotoGridProps {
  /** Already in display order (`spotPhotos`): primary first. */
  photos: Media[];
  onPressPhoto?: (index: number) => void;
  /**
   * Drawn over the tile's top-right corner: the ✕ remove button in edit, the 'new' mark on a staged add. A badge
   * that isn't a button should set `pointerEvents="none"` so taps on it reach the tile.
   */
  renderBadge?: (media: Media, index: number) => ReactNode;
  /** Rendered as the last square tile, e.g. the '+' add tile in edit. */
  trailing?: ReactNode;
}

/** Before the row is measured, 31% keeps the first frame three across. */
const UNMEASURED_TILE: DimensionValue = '31%';

/** The primary photo full width at 4:3, then every other photo in rows of three square tiles. */
export function PhotoGrid({ photos, onPressPhoto, renderBadge, trailing }: PhotoGridProps) {
  const [rowWidth, setRowWidth] = useState(0);
  if (photos.length === 0 && trailing == null) return null;

  // Floored to the pixel grid: an exact third can round past the row width and wrap the third tile.
  const scale = PixelRatio.get();
  const tileWidth =
    rowWidth > 0 ? Math.floor(((rowWidth - 2 * spacing.xs) / 3) * scale) / scale : UNMEASURED_TILE;
  const onRowLayout = (e: LayoutChangeEvent) => setRowWidth(e.nativeEvent.layout.width);

  // The badge sits beside the Pressable, not inside it: an accessible imagebutton would hide a nested
  // ✕ button from VoiceOver.
  const tile = (media: Media, index: number) => (
    <View key={media.id} style={index === 0 ? undefined : { width: tileWidth }}>
      <Pressable
        testID={`photo-tile-${index}`}
        onPress={onPressPhoto ? () => onPressPhoto(index) : undefined}
        disabled={!onPressPhoto}
        accessibilityRole="imagebutton"
        accessibilityLabel={`Photo ${index + 1} of ${photos.length}`}
        style={index === 0 ? styles.hero : styles.tile}>
        <Image source={{ uri: resolvePhotoUri(media.file_path) }} style={styles.image} contentFit="cover" />
      </Pressable>
      {renderBadge ? <View style={styles.badge} pointerEvents="box-none">{renderBadge(media, index)}</View> : null}
    </View>
  );

  const [hero, ...rest] = photos;
  return (
    <View style={styles.grid}>
      {hero ? tile(hero, 0) : null}
      {rest.length > 0 || trailing != null ? (
        <View style={styles.row} onLayout={onRowLayout}>
          {rest.map((m, i) => tile(m, i + 1))}
          {trailing != null ? <View style={[styles.tile, { width: tileWidth }]}>{trailing}</View> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: spacing.xs,
  },
  hero: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: palette.gray[100],
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  tile: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: palette.gray[100],
  },
  image: {
    width: '100%',
    height: '100%',
  },
  badge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
  },
});
