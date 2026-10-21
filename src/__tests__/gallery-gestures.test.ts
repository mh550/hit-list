import {
  CLOSE_DISTANCE,
  DOUBLE_TAP_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  PAN_SLOP,
  ZOOMED_EPSILON,
  clampPan,
  clampScale,
  doubleTapZoom,
  dragDown,
  focalZoom,
  pagingEnabled,
  pinchPan,
  shouldClose,
  toggleZoom,
} from '@/src/utils/gallery-gestures';

const phone = { width: 390, height: 844 };
const centre = { x: 195, y: 422 };

describe('constants', () => {
  it('match the viewer plan', () => {
    expect([MIN_SCALE, MAX_SCALE, DOUBLE_TAP_SCALE, ZOOMED_EPSILON, CLOSE_DISTANCE]).toEqual([1, 4, 2.5, 1.05, 120]);
  });

  it('starts an unzoomed pan after 10 px of vertical movement and fails it after 10 px sideways', () => {
    expect(PAN_SLOP).toBe(10);
  });
});

describe('clampScale', () => {
  it('keeps the scale between 1 and 4', () => {
    expect(clampScale(0.5)).toBe(1);
    expect(clampScale(6)).toBe(4);
    expect(clampScale(2.2)).toBe(2.2);
  });
});

describe('toggleZoom', () => {
  it('zooms to 2.5 from about 1x and back to 1 otherwise', () => {
    expect(toggleZoom(1)).toBe(2.5);
    expect(toggleZoom(1.04)).toBe(2.5);
    expect(toggleZoom(2.5)).toBe(1);
    expect(toggleZoom(1.05)).toBe(1);
  });
});

describe('clampPan', () => {
  it('allows no pan at 1x or below', () => {
    expect(clampPan({ x: 500, y: -900 }, 1, phone)).toEqual({ x: 0, y: 0 });
    expect(clampPan({ x: -30, y: 12 }, 1, phone)).toEqual({ x: 0, y: 0 });
    expect(clampPan({ x: -30, y: 12 }, 0.8, phone)).toEqual({ x: 0, y: 0 });
  });

  it('never returns -0', () => {
    const { x, y } = clampPan({ x: -30, y: -12 }, 1, phone);

    expect(Object.is(x, 0)).toBe(true);
    expect(Object.is(y, 0)).toBe(true);
  });

  it('stops the scaled image at the viewport edge', () => {
    expect(clampPan({ x: 500, y: -900 }, 2, phone)).toEqual({ x: 195, y: -422 });
    expect(clampPan({ x: -500, y: 900 }, 2, phone)).toEqual({ x: -195, y: 422 });
  });

  it('leaves a translation inside the bounds alone', () => {
    expect(clampPan({ x: 40, y: -100 }, 2, phone)).toEqual({ x: 40, y: -100 });
  });
});

describe('pagingEnabled', () => {
  it('pages only at about 1x', () => {
    expect(pagingEnabled(1)).toBe(true);
    expect(pagingEnabled(1.05)).toBe(true);
    expect(pagingEnabled(1.06)).toBe(false);
  });
});

describe('shouldClose', () => {
  it('closes on a swipe down past 120 at about 1x', () => {
    expect(shouldClose(121, 1)).toBe(true);
    expect(shouldClose(119, 1)).toBe(false);
    expect(shouldClose(120, 1)).toBe(false);
    expect(shouldClose(-200, 1)).toBe(false);
  });

  it('never closes while zoomed', () => {
    expect(shouldClose(300, 2)).toBe(false);
  });
});

describe('focalZoom', () => {
  it('needs no translation for a focal point at the centre', () => {
    expect(focalZoom(centre, 1, 2.5, phone)).toEqual({ x: 0, y: 0 });
  });

  it('keeps a corner fixed when zooming from 1x', () => {
    // Top-left at 2.5x: the image moves right and down by 1.5 × half the viewport.
    expect(focalZoom({ x: 0, y: 0 }, 1, 2.5, phone)).toEqual({ x: 292.5, y: 633 });
  });

  it('keeps the focal point fixed from an already panned zoom', () => {
    const translation = { x: 50, y: -20 };
    const focal = { x: 300, y: 200 };
    const t = focalZoom(focal, 2, 3, phone, translation);

    // The image point under the focal before (scale 2) is still under it after (scale 3).
    const before = { x: (focal.x - centre.x - translation.x) / 2, y: (focal.y - centre.y - translation.y) / 2 };
    expect(centre.x + t.x + 3 * before.x).toBeCloseTo(focal.x);
    expect(centre.y + t.y + 3 * before.y).toBeCloseTo(focal.y);
  });

  it('returns to no translation when zooming back to 1x around the centre', () => {
    expect(focalZoom(centre, 2.5, 1, phone)).toEqual({ x: 0, y: 0 });
  });
});

describe('dragDown', () => {
  it('follows a downward drag and ignores an upward one', () => {
    expect(dragDown(150)).toBe(150);
    expect(dragDown(0)).toBe(0);
    expect(Object.is(dragDown(-40), 0)).toBe(true);
  });
});


describe('pinchPan', () => {
  it('is focalZoom about the start point while the fingers stay put', () => {
    const start = { scale: 1.5, t: { x: 20, y: -10 }, focal: { x: 100, y: 600 } };
    expect(pinchPan(start, start.focal, 3, phone)).toEqual(focalZoom(start.focal, 1.5, 3, phone, start.t));
  });

  it('follows fingers that drag while pinching', () => {
    const start = { scale: 1, t: { x: 0, y: 0 }, focal: centre };
    expect(pinchPan(start, { x: centre.x + 50, y: centre.y + 30 }, 2, phone)).toEqual({ x: 50, y: 30 });
    // At an unchanged scale it is a plain two-finger pan.
    expect(pinchPan({ ...start, scale: 2 }, { x: centre.x - 40, y: centre.y }, 2, phone)).toEqual({ x: -40, y: 0 });
  });
});

describe('doubleTapZoom', () => {
  it('zooms to 2.5x about the tapped point, clamped, and back to 1x with no translation', () => {
    const tap = { x: 0, y: 0 };
    const { width: w, height: h } = phone;
    expect(doubleTapZoom(1, { x: 0, y: 0 }, tap, phone)).toEqual({
      scale: 2.5,
      t: clampPan(focalZoom(tap, 1, 2.5, phone), 2.5, phone),
    });
    expect(doubleTapZoom(1, { x: 0, y: 0 }, tap, phone).t).toEqual({ x: (w * 1.5) / 2, y: (h * 1.5) / 2 });
    expect(doubleTapZoom(2.5, { x: 120, y: -80 }, centre, phone)).toEqual({ scale: 1, t: { x: 0, y: 0 } });
  });
});
