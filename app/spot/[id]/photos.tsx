import { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMediaStore, useSpotsStore } from '@/src/stores';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { resolvePhotoUri } from '@/src/utils/photo-storage';
import { spotPhotos } from '@/src/utils/spot-photos';
import { spacing } from '@/src/constants/theme';
import type { Media } from '@/src/types';

const clampIndex = (i: number, count: number) => Math.max(0, Math.min(i, count - 1));

/**
 * Full-screen photo pager (fullScreenModal, no header): one window-wide page per photo, opened at `?index=N`
 * (clamped; missing or not a number → 0), a 'N / M' counter and a ✕ that goes back. Only the Stack's own back
 * handling closes it otherwise; nothing is intercepted.
 */
export default function PhotoViewerScreen() {
  const { id, index } = useLocalSearchParams<{ id: string; index?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const spot = useSpotsStore((s) => s.spots.find((sp) => sp.id === id));
  const media = useMediaStore((s) => (id ? s.mediaBySpot[id] : undefined));
  const current = spot ? spotPhotos(spot, media) : [];

  // D29: the order is fixed while the viewer is open (a new primary does not jump to page 1). Removed photos
  // drop out; photos added meanwhile go at the end.
  const [order] = useState(() => current.map((m) => m.id));
  const byId = new Map(current.map((m) => [m.id, m]));
  const photos = [
    ...order.flatMap((mid) => byId.get(mid) ?? []),
    ...current.filter((m) => !order.includes(m.id)),
  ];
  const count = photos.length;

  const [page, setPage] = useState(() => clampIndex(Number.parseInt(index ?? '', 10) || 0, current.length));
  const shown = clampIndex(page, count);

  const close = useCallback(() => router.back(), [router]);
  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / width)),
    [width],
  );
  const getItemLayout = useCallback(
    (_: ArrayLike<Media> | null | undefined, i: number) => ({ length: width, offset: width * i, index: i }),
    [width],
  );
  const renderItem = useCallback(
    ({ item, index: i }: { item: Media; index: number }) => (
      <View
        style={{ width, height }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Photo ${i + 1} of ${count}`}>
        <Image
          source={{ uri: resolvePhotoUri(item.file_path) }}
          recyclingKey={item.id}
          contentFit="contain"
          style={StyleSheet.absoluteFill}
        />
      </View>
    ),
    [width, height, count],
  );

  return (
    <View style={styles.root} testID="photo-viewer">
      <StatusBar hidden />
      {spot ? (
        <FlatList
          data={photos}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={count > 0 ? shown : undefined}
          getItemLayout={getItemLayout}
          onMomentumScrollEnd={onMomentumScrollEnd}
          initialNumToRender={1}
          maxToRenderPerBatch={1}
          windowSize={3}
        />
      ) : (
        <View style={styles.centered}>
          <Text style={styles.notFound}>Spot not found</Text>
        </View>
      )}
      <View style={[styles.chrome, { top: insets.top }]} pointerEvents="box-none">
        {count > 0 ? (
          <Text style={styles.counter} accessibilityRole="text" accessibilityLiveRegion="polite">
            {`${shown + 1} / ${count}`}
          </Text>
        ) : null}
        <Pressable
          onPress={close}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel="Close">
          <IconSymbol name="xmark" size={22} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFound: {
    fontSize: 16,
    color: '#fff',
  },
  chrome: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },
  close: {
    position: 'absolute',
    right: spacing.sm,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
