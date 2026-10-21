// Gesture maths for the full-screen photo viewer. Every function is a worklet so the gesture
// callbacks can call it on the UI thread; nothing here imports React or reanimated.
// The page transform is translate then scale about the view's centre (React Native's default origin).

export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
/** Where a pinch began: the scale, the translation and the fingers' focal point. */
export type PinchStart = { scale: number; t: Point; focal: Point };

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
export const DOUBLE_TAP_SCALE = 2.5;
export const ZOOMED_EPSILON = 1.05; // at or below this the photo counts as unzoomed
export const CLOSE_DISTANCE = 120; // swipe-down distance that closes the viewer at 1×
export const LONG_PRESS_MS = 500; // a page's options; the double tap it waits for fails only after its 500 ms maxDuration

/** `+ 0` turns -0 into 0, so callers (and `toEqual`) never see a signed zero. */
function point(x: number, y: number): Point {
  'worklet';
  return { x: x + 0, y: y + 0 };
}

function clamp(value: number, limit: number): number {
  'worklet';
  return Math.min(Math.max(value, -limit), limit);
}

export function clampScale(scale: number): number {
  'worklet';
  return Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE);
}

/** Double tap: zoom in from about 1×, otherwise back to 1×. */
export function toggleZoom(scale: number): number {
  'worklet';
  return scale < ZOOMED_EPSILON ? DOUBLE_TAP_SCALE : MIN_SCALE;
}

/** Limits the translation so the scaled image never leaves a gap at the viewport edge (bounded by the viewport, not the contained photo). */
export function clampPan(t: Point, scale: number, viewport: Size): Point {
  'worklet';
  const extra = Math.max(0, scale - 1) / 2;
  return point(clamp(t.x, viewport.width * extra), clamp(t.y, viewport.height * extra));
}

/** The pager swipes only while the photo is unzoomed. */
export function pagingEnabled(scale: number): boolean {
  'worklet';
  return scale <= ZOOMED_EPSILON;
}

export function shouldClose(dy: number, scale: number): boolean {
  'worklet';
  return scale <= ZOOMED_EPSILON && dy > CLOSE_DISTANCE;
}

/** How far the photo follows a swipe-down at 1×: downward only, an upward drag stays at 0. */
export function dragDown(dy: number): number {
  'worklet';
  return Math.max(0, dy) + 0;
}

/**
 * The translation at `nextScale` that keeps `focal` (view coordinates, e.g. a gesture's x/y) over the same
 * image point it covers at `scale` with `translation`.
 */
export function focalZoom(
  focal: Point,
  scale: number,
  nextScale: number,
  viewport: Size,
  translation: Point = { x: 0, y: 0 },
): Point {
  'worklet';
  const dx = focal.x - viewport.width / 2;
  const dy = focal.y - viewport.height / 2;
  const ratio = nextScale / scale;
  return point(dx - ratio * (dx - translation.x), dy - ratio * (dy - translation.y));
}

/**
 * A pinch's translation at `nextScale`: zoom about where the fingers started, then follow them, so the image point
 * that was under the fingers stays under them while they drag.
 */
export function pinchPan(start: PinchStart, focal: Point, nextScale: number, viewport: Size): Point {
  'worklet';
  const t = focalZoom(start.focal, start.scale, nextScale, viewport, start.t);
  return point(t.x + focal.x - start.focal.x, t.y + focal.y - start.focal.y);
}

/** A double tap at `tap` (view coordinates): toggleZoom about the tapped point, clamped so no gap shows. */
export function doubleTapZoom(scale: number, t: Point, tap: Point, viewport: Size): { scale: number; t: Point } {
  'worklet';
  const next = toggleZoom(scale);
  return { scale: next, t: clampPan(focalZoom(tap, scale, next, viewport, t), next, viewport) };
}
