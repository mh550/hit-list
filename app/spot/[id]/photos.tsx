import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMediaStore, useSpotsStore } from '@/src/stores';
import { useSpotActions } from '@/src/hooks/use-spot-actions';
import { useMediaActions } from '@/src/hooks/use-media-actions';
import { ZoomablePhoto } from '@/src/components';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { resolvePhotoUri } from '@/src/utils/photo-storage';
import { primaryPhoto, spotPhotos } from '@/src/utils/spot-photos';
import { MIN_SCALE, pagingEnabled } from '@/src/utils/gallery-gestures';
import { spacing } from '@/src/constants/theme';
import type { Media } from '@/src/types';

const clampIndex = (i: number, count: number) => Math.max(0, Math.min(i, count - 1));
const OPTIONS_ACTIONS = [{ name: 'longpress', label: 'Photo options' }];

/** D29: the order snapshotted on open, without removed photos, then photos added since. */
function inViewerOrder(order: string[], current: Media[]): Media[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  return [...order.flatMap((mid) => byId.get(mid) ?? []), ...current.filter((m) => !order.includes(m.id))];
}

/**
 * Full-screen photo pager (fullScreenModal, no header): one window-wide page per photo, opened at `?index=N`
 * (clamped; missing or not a number → 0), a 'N / M' counter and a ✕ that goes back. Each page is a ZoomablePhoto;
 * paging is locked while a pinch runs and while the shown photo is zoomed past 1.05×, and a swipe down at 1× goes back
 * too. Android's back button pops it through the Stack; nothing is intercepted (an iOS fullScreenModal has no swipe to
 * dismiss of its own). A long press offers Set as primary and Remove photo (confirmed); removing the last photo closes
 * the viewer.
 */
export default function PhotoViewerScreen() {
  const { id, index } = useLocalSearchParams<{ id: string; index?: string }>();
  const router = useRouter();
  const { updateSpot } = useSpotActions();
  const { removePhotos } = useMediaActions();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const spot = useSpotsStore((s) => s.spots.find((sp) => sp.id === id));
  const media = useMediaStore((s) => (id ? s.mediaBySpot[id] : undefined));
  const current = spot ? spotPhotos(spot, media) : [];

  // D29: the order is fixed while the viewer is open (a new primary does not jump to page 1). Removed photos
  // drop out; photos added meanwhile go at the end.
  const [order] = useState(() => current.map((m) => m.id));
  const photos = inViewerOrder(order, current);
  const count = photos.length;

  // The shown photo is pinned by id, so it stays shown when the list changes around it. When it is the one removed,
  // its old index (clamped) shows the photo that took its place: the next one, or the previous one at the end.
  const [pos, setPos] = useState(() => {
    const i = clampIndex(Number.parseInt(index ?? '', 10) || 0, current.length);
    return { id: current[i]?.id, index: i };
  });
  const found = photos.findIndex((m) => m.id === pos.id);
  const shown = found >= 0 ? found : clampIndex(pos.index, count);
  // The settled scale of the shown page (only that page gets gestures) and whether a pinch is running; paging follows
  // both, so the pager does not slide under a pinch that starts at 1×.
  const [zoom, setZoom] = useState(MIN_SCALE);
  const [pinching, setPinching] = useState(false);

  // A removal changes the pages under the native scroll offset, so move the offset to the shown photo (before paint).
  const listRef = useRef<FlatList<Media>>(null);
  const syncedCount = useRef(count);
  useLayoutEffect(() => {
    if (count === syncedCount.current) return;
    syncedCount.current = count;
    if (count > 0) listRef.current?.scrollToIndex({ index: shown, animated: false });
  }, [count, shown]);

  const close = useCallback(() => router.back(), [router]);
  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / width);
      setPos({ id: photos[i]?.id, index: i });
      setZoom(MIN_SCALE);
    },
    [width, photos, setPos],
  );

  // The options act on the stores as they are when a button is pressed, not as they were when the page rendered.
  const setPrimary = useCallback(
    (photoId: string) => {
      if (!id) return;
      updateSpot(id, { primary_photo_id: photoId }).catch(() => {
        // updateSpot logged it and put the old primary back.
        Alert.alert("This photo couldn't be set as primary", 'Try again later.');
      });
    },
    [id, updateSpot],
  );
  const remove = useCallback(
    async (photoId: string) => {
      const now = useSpotsStore.getState().spots.find((sp) => sp.id === id);
      if (!now) return;
      const nowMedia = useMediaStore.getState().mediaBySpot[now.id];
      const pages = inViewerOrder(order, spotPhotos(now, nowMedia));
      const wasPrimary = primaryPhoto(now, nowMedia)?.id === photoId;
      const i = pages.findIndex((m) => m.id === photoId);
      if (i < 0) return; // already gone (removed elsewhere while the confirm was up)
      const remaining = pages.filter((m) => m.id !== photoId);
      const removed = await removePhotos([photoId]);
      if (!removed.includes(photoId)) {
        Alert.alert("This photo couldn't be removed", "It's still on this spot. Try again later.");
        return;
      }
      // If it is still the shown photo (no swipe while it was removed), the photo now in its place (the next one, else
      // the previous one) is shown, at 1×.
      const next = remaining[i] ?? remaining[i - 1];
      setPos((p) => (p.id === photoId ? { id: next?.id, index: clampIndex(i, remaining.length) } : p));
      setZoom(MIN_SCALE);
      if (remaining.length === 0) router.back();
      // It also becomes the primary; null clears it when none remain. updateSpot logs a failure, and the primary
      // then falls back to the first photo (primaryPhoto).
      if (wasPrimary) updateSpot(now.id, { primary_photo_id: next?.id ?? null }).catch(() => {});
    },
    [id, order, removePhotos, updateSpot, router, setPos],
  );
  const showOptions = useCallback(
    (photoId: string) =>
      Alert.alert('Photo', undefined, [
        { text: 'Set as primary', onPress: () => setPrimary(photoId) },
        {
          text: 'Remove photo',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Remove this photo?', 'It is taken off this spot.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => void remove(photoId) },
            ]),
        },
        { text: 'Cancel', style: 'cancel' },
      ]),
    [setPrimary, remove],
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
        accessibilityLabel={`Photo ${i + 1} of ${count}`}
        accessibilityHint="Double-tap and hold for options"
        accessibilityActions={OPTIONS_ACTIONS}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'longpress') showOptions(item.id);
        }}>
        <ZoomablePhoto
          uri={resolvePhotoUri(item.file_path)}
          recyclingKey={item.id}
          width={width}
          height={height}
          onScaleChange={setZoom}
          onPinchChange={setPinching}
          onRequestClose={close}
          onLongPress={() => showOptions(item.id)}
          testIdPrefix={`viewer-${i}`}
        />
      </View>
    ),
    [width, height, count, close, showOptions],
  );

  return (
    <View style={styles.root} testID="photo-viewer">
      <StatusBar hidden />
      {spot ? (
        <FlatList
          ref={listRef}
          data={photos}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          horizontal
          pagingEnabled
          scrollEnabled={pagingEnabled(zoom) && !pinching}
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
