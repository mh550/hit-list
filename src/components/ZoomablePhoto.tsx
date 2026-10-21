import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  LONG_PRESS_MS,
  MIN_SCALE,
  clampPan,
  clampScale,
  dragDown,
  focalZoom,
  pagingEnabled,
  shouldClose,
  toggleZoom,
  type Point,
} from '@/src/utils/gallery-gestures';

type ZoomablePhotoProps = {
  uri: string;
  recyclingKey: string;
  width: number;
  height: number;
  /** The scale a gesture settled on (1 after a pinch that ends at or below 1.05×). */
  onScaleChange?: (scale: number) => void;
  /** A swipe down past the close distance at 1×. */
  onRequestClose?: () => void;
  /** A one-finger press held for LONG_PRESS_MS (not during a pinch, not on a double tap). */
  onLongPress?: () => void;
  /** Gesture test ids: `<prefix>-pinch`, `<prefix>-pan`, `<prefix>-double-tap`, `<prefix>-long-press`. */
  testIdPrefix?: string;
};

/**
 * One viewer page: pinch 1×–4× about the fingers, pan while zoomed, double tap 1× ↔ 2.5×, swipe down at 1× to close,
 * long press for options. Every number comes from `gallery-gestures`; the worklets read only shared values and the
 * captured size. At 1× the pan is vertical only (it fails on sideways movement), so the pager keeps sideways swipes.
 */
export function ZoomablePhoto(props: ZoomablePhotoProps) {
  const { uri, recyclingKey, width, height, onScaleChange, onRequestClose, onLongPress, testIdPrefix = 'photo' } = props;
  const scale = useSharedValue(MIN_SCALE);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startScale = useSharedValue(MIN_SCALE);
  const startT = useSharedValue<Point>({ x: 0, y: 0 });
  const dragY = useSharedValue(0);
  const pinching = useSharedValue(false);
  const panZoomed = useSharedValue(false); // the pan began zoomed: it moves the photo and never closes
  // Mirrors the settled scale on the React side; it only switches the pan's activation rules.
  const [zoomed, setZoomed] = useState(false);

  const report = useCallback(
    (next: number) => {
      setZoomed(!pagingEnabled(next));
      onScaleChange?.(next);
    },
    [onScaleChange],
  );
  const close = useCallback(() => onRequestClose?.(), [onRequestClose]);
  const longPressed = useCallback(() => onLongPress?.(), [onLongPress]);

  const gesture = useMemo(() => {
    const viewport = { width, height };
    const settle = (next: number, t: Point) => {
      'worklet';
      scale.set(withTiming(next));
      tx.set(withTiming(t.x));
      ty.set(withTiming(t.y));
      scheduleOnRN(report, next);
    };

    const pinch = Gesture.Pinch()
      .withTestId(`${testIdPrefix}-pinch`)
      .onStart(() => {
        pinching.set(true);
        startScale.set(scale.get());
        startT.set({ x: tx.get(), y: ty.get() });
      })
      .onUpdate((e) => {
        const next = clampScale(startScale.get() * e.scale);
        const t = focalZoom({ x: e.focalX, y: e.focalY }, startScale.get(), next, viewport, startT.get());
        const clamped = clampPan(t, next, viewport);
        scale.set(next);
        tx.set(clamped.x);
        ty.set(clamped.y);
      })
      .onEnd(() => {
        pinching.set(false);
        const next = pagingEnabled(scale.get()) ? MIN_SCALE : scale.get();
        settle(next, clampPan({ x: tx.get(), y: ty.get() }, next, viewport));
      });

    const pan = Gesture.Pan()
      .withTestId(`${testIdPrefix}-pan`)
      .maxPointers(1)
      .onStart(() => panZoomed.set(!pagingEnabled(scale.get())))
      .onChange((e) => {
        if (!panZoomed.get()) {
          dragY.set(dragDown(e.translationY));
          return;
        }
        // Per-frame deltas, so a pinch that starts or ends mid-pan (and owns tx/ty meanwhile) causes no jump.
        if (pinching.get()) return;
        const t = clampPan({ x: tx.get() + e.changeX, y: ty.get() + e.changeY }, scale.get(), viewport);
        tx.set(t.x);
        ty.set(t.y);
      })
      .onEnd((e, success) => {
        if (success && !panZoomed.get() && shouldClose(e.translationY, scale.get())) scheduleOnRN(close);
        else dragY.set(withTiming(0));
      });
    if (!zoomed) pan.activeOffsetY([-10, 10]).failOffsetX([-10, 10]);

    const doubleTap = Gesture.Tap()
      .withTestId(`${testIdPrefix}-double-tap`)
      .numberOfTaps(2)
      .onEnd((e, success) => {
        if (!success) return;
        const next = toggleZoom(scale.get());
        const from = { x: tx.get(), y: ty.get() };
        settle(next, clampPan(focalZoom({ x: e.x, y: e.y }, scale.get(), next, viewport, from), next, viewport));
      });

    const longPress = Gesture.LongPress()
      .withTestId(`${testIdPrefix}-long-press`)
      .minDuration(LONG_PRESS_MS)
      .onStart(() => !pinching.get() && scheduleOnRN(longPressed));

    return Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, longPress));
  }, [width, height, zoomed, testIdPrefix, report, close, longPressed, scale, tx, ty, startScale, startT, dragY,
    pinching, panZoomed]);

  const transform = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.get() }, { translateY: ty.get() + dragY.get() }, { scale: scale.get() }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      {/* Not transformed, so gesture coordinates (focal point, tap) are in page space. */}
      <View style={{ width, height }} collapsable={false}>
        <Animated.View style={[StyleSheet.absoluteFill, transform]}>
          <Image source={{ uri }} recyclingKey={recyclingKey} contentFit="contain" style={StyleSheet.absoluteFill} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
