import { nextSpeedRange, speedRangeLabel } from '@/src/utils/speed-range';

describe('nextSpeedRange', () => {
  it('a first tap with no range emits [t, t] and anchors on t', () => {
    expect(nextSpeedRange(undefined, undefined, 2)).toEqual({ range: [2, 2], anchor: 2 });
  });

  it('a second, different tap completes the range low to high', () => {
    expect(nextSpeedRange([1, 1], 1, 3)).toEqual({ range: [1, 3], anchor: undefined });
  });

  it('high before low still orders the range', () => {
    expect(nextSpeedRange([3, 3], 3, 1)).toEqual({ range: [1, 3], anchor: undefined });
  });

  it('tapping the anchor again selects just that value', () => {
    expect(nextSpeedRange([2, 2], 2, 2)).toEqual({ range: [2, 2], anchor: undefined });
  });

  it('a tap inside a complete range clears it', () => {
    expect(nextSpeedRange([2, 2], undefined, 2)).toEqual({ range: undefined, anchor: undefined });
    expect(nextSpeedRange([1, 3], undefined, 2)).toEqual({ range: undefined, anchor: undefined });
    expect(nextSpeedRange([1, 3], undefined, 1)).toEqual({ range: undefined, anchor: undefined });
  });

  it('a tap outside a complete range starts a new one', () => {
    expect(nextSpeedRange([1, 3], undefined, 4)).toEqual({ range: [4, 4], anchor: 4 });
    expect(nextSpeedRange([1, 3], undefined, 0)).toEqual({ range: [0, 0], anchor: 0 });
  });

  it('ignores an anchor that no longer matches the range (reset from outside)', () => {
    // The anchor counts only while the range is [anchor, anchor]; after an outside change it is stale.
    expect(nextSpeedRange(undefined, 2, 3)).toEqual({ range: [3, 3], anchor: 3 });
    expect(nextSpeedRange([0, 4], 2, 3)).toEqual({ range: undefined, anchor: undefined });
  });

  it('treats 0 as a real value', () => {
    expect(nextSpeedRange([0, 0], 0, 2)).toEqual({ range: [0, 2], anchor: undefined });
    expect(nextSpeedRange([0, 2], undefined, 0)).toEqual({ range: undefined, anchor: undefined });
  });
});

describe('speedRangeLabel', () => {
  it.each([
    [undefined, 'Any'],
    [[2, 2], 'Some'],
    [[0, 0], 'None'],
    [[1, 3], 'Little to Enough'],
    [[0, 4], 'None to Too much'],
  ] as const)('%j reads %s', (range, label) => {
    expect(speedRangeLabel(range as never)).toBe(label);
  });
});
