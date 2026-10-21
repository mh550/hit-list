import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, fireEvent, within } from '@testing-library/react-native';

import { SpeedScale } from '@/src/components';
import { palette } from '@/src/constants/theme';
import type { NaturalSpeed } from '@/src/types';

// The radiogroup container is deliberately not `accessible` (that would merge the radios into one VoiceOver
// element), so getByRole cannot see it; find the host View by its role prop instead.
const radioGroups = () =>
  screen.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'radiogroup');

const SEGMENTS = [
  'None: Flat. You make all the speed.',
  'Little: Slight slope. Needs a lot of help.',
  'Some: Some slope. Needs a bit of help.',
  'Enough: Rolls in with speed for most tricks.',
  'Too much: Steep. You have to scrub speed.',
];

describe('SpeedScale (edit form)', () => {
  it('renders five radios inside one radiogroup, labelled "<label>: <description>"', () => {
    render(<SpeedScale onChange={() => {}} />);
    expect(radioGroups()).toHaveLength(1);
    const [group] = radioGroups();
    expect(group.props.accessible).not.toBe(true);
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.props.accessibilityLabel)).toEqual(SEGMENTS);
    expect(screen.getAllByRole('radio')).toHaveLength(5);
  });

  it('tells VoiceOver that the checked segment clears on a second tap', () => {
    render(<SpeedScale value={3} onChange={() => {}} />);
    const hints = screen.getAllByRole('radio').map((r) => r.props.accessibilityHint);
    expect(hints).toEqual([undefined, undefined, undefined, 'Double-tap to clear the rating.', undefined]);
  });

  it('reads "Not rated" when unset', () => {
    render(<SpeedScale onChange={() => {}} />);
    expect(screen.getByText('Not rated')).toBeTruthy();
    expect(screen.getAllByRole('radio').every((r) => !r.props.accessibilityState?.checked)).toBe(true);
  });

  it('pressing a segment selects it', () => {
    const onChange = jest.fn();
    render(<SpeedScale onChange={onChange} />);
    fireEvent.press(screen.getByText('Enough'));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('pressing the selected segment again clears it', () => {
    const onChange = jest.fn();
    render(<SpeedScale value={3} onChange={onChange} />);
    fireEvent.press(screen.getByText('Enough'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('shows the selected description and marks that radio checked', () => {
    render(<SpeedScale value={4} onChange={() => {}} />);
    expect(screen.getByText('Steep. You have to scrub speed.')).toBeTruthy();
    expect(screen.queryByText('Not rated')).toBeNull();
    expect(screen.getByRole('radio', { name: SEGMENTS[4] }).props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true }),
    );
  });

  it('treats 0 as None, not as unset', () => {
    const onChange = jest.fn();
    render(<SpeedScale value={0} onChange={onChange} />);
    expect(screen.getByText('Flat. You make all the speed.')).toBeTruthy();
    expect(screen.queryByText('Not rated')).toBeNull();
    fireEvent.press(screen.getByText('None'));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('fills the selected segment with palette.blue[500]', () => {
    render(<SpeedScale value={2} onChange={() => {}} />);
    const selected = screen.getByRole('radio', { name: SEGMENTS[2] });
    expect(StyleSheet.flatten(selected.props.style).backgroundColor).toBe(palette.blue[500]);
    const other = screen.getByRole('radio', { name: SEGMENTS[1] });
    expect(StyleSheet.flatten(other.props.style).backgroundColor).not.toBe(palette.blue[500]);
  });
});

describe('SpeedScale (readonly bar)', () => {
  const filled = (i: number) => screen.getByTestId(`speed-cell-${i}`).props.accessibilityState?.selected === true;

  it('fills cells 0..value and shows the word', () => {
    render(<SpeedScale value={3} readonly />);
    expect([0, 1, 2, 3, 4].map(filled)).toEqual([true, true, true, true, false]);
    expect(screen.getByText('Enough')).toBeTruthy();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByLabelText('Natural speed: Enough')).toBeTruthy();
  });

  it('fills cells with palette.blue[500]', () => {
    render(<SpeedScale value={3} readonly />);
    const style = StyleSheet.flatten(screen.getByTestId('speed-cell-3').props.style);
    expect(style.backgroundColor).toBe(palette.blue[500]);
    const empty = StyleSheet.flatten(screen.getByTestId('speed-cell-4').props.style);
    expect(empty.backgroundColor).not.toBe(palette.blue[500]);
  });

  it('value 0 fills only the first cell and reads None', () => {
    render(<SpeedScale value={0} readonly />);
    expect([0, 1, 2, 3, 4].map(filled)).toEqual([true, false, false, false, false]);
    expect(screen.getByLabelText('Natural speed: None')).toBeTruthy();
  });

  it('renders nothing when not rated', () => {
    render(<SpeedScale readonly />);
    expect(screen.toJSON()).toBeNull();
  });
});

describe('SpeedScale (range mode)', () => {
  type Range = [NaturalSpeed, NaturalSpeed] | undefined;

  // The Filter sheet owns the range; this harness plays that part so taps build on each other.
  function Controlled({ initial, onRangeChange }: { initial?: Range; onRangeChange: (r: Range) => void }) {
    const [range, setRange] = useState<Range>(initial);
    return (
      <SpeedScale
        rangeValue={range}
        onRangeChange={(r) => {
          onRangeChange(r);
          setRange(r);
        }}
      />
    );
  }

  const segments = () => screen.getAllByRole('button');
  const selected = () => segments().map((s) => s.props.accessibilityState?.selected === true);

  it('with no range selects no segment and reads "Any"', () => {
    render(<SpeedScale rangeValue={undefined} onRangeChange={() => {}} />);
    expect(segments()).toHaveLength(5);
    expect(selected()).toEqual([false, false, false, false, false]);
    expect(screen.getByText('Any')).toBeTruthy();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(radioGroups()).toHaveLength(0);
  });

  it('the description line tells VoiceOver what it describes', () => {
    render(<SpeedScale rangeValue={[1, 3]} onRangeChange={() => {}} />);
    expect(screen.getByLabelText('Natural speed: Little to Enough')).toBeTruthy();
  });

  it('Little then Enough selects [1, 3] and reads "Little to Enough"', () => {
    const onRangeChange = jest.fn();
    render(<Controlled onRangeChange={onRangeChange} />);
    fireEvent.press(screen.getByText('Little'));
    fireEvent.press(screen.getByText('Enough'));
    expect(onRangeChange).toHaveBeenLastCalledWith([1, 3]);
    expect(screen.getByText('Little to Enough')).toBeTruthy();
    expect(selected()).toEqual([false, true, true, true, false]);
  });

  it('Some twice selects just [2, 2] and reads "Some"', () => {
    const onRangeChange = jest.fn();
    render(<Controlled onRangeChange={onRangeChange} />);
    fireEvent.press(screen.getByText('Some'));
    // After one tap the description line reads 'Some' too; the segment comes first.
    fireEvent.press(screen.getAllByText('Some')[0]);
    expect(onRangeChange).toHaveBeenCalledTimes(2);
    expect(onRangeChange).toHaveBeenLastCalledWith([2, 2]);
    expect(screen.getAllByText('Some')).toHaveLength(2);
    expect(selected()).toEqual([false, false, true, false, false]);
  });

  it('Enough then Little (high before low) still selects [1, 3]', () => {
    const onRangeChange = jest.fn();
    render(<Controlled onRangeChange={onRangeChange} />);
    fireEvent.press(screen.getByText('Enough'));
    fireEvent.press(screen.getByText('Little'));
    expect(onRangeChange).toHaveBeenLastCalledWith([1, 3]);
  });

  it('with [2, 2] selected, pressing Some again clears the range', () => {
    const onRangeChange = jest.fn();
    render(<Controlled initial={[2, 2]} onRangeChange={onRangeChange} />);
    fireEvent.press(screen.getAllByText('Some')[0]);
    expect(onRangeChange).toHaveBeenCalledTimes(1);
    expect(onRangeChange).toHaveBeenCalledWith(undefined);
    expect(screen.getByText('Any')).toBeTruthy();
  });

  it('a tap outside a complete range starts a new one', () => {
    const onRangeChange = jest.fn();
    render(<Controlled initial={[1, 3]} onRangeChange={onRangeChange} />);
    fireEvent.press(screen.getByText('Too much'));
    expect(onRangeChange).toHaveBeenLastCalledWith([4, 4]);
  });

  it('fills the segments inside the range with palette.blue[500]', () => {
    render(<SpeedScale rangeValue={[1, 3]} onRangeChange={() => {}} />);
    const fills = segments().map((s) => StyleSheet.flatten(s.props.style).backgroundColor === palette.blue[500]);
    expect(fills).toEqual([false, true, true, true, false]);
  });

  it('labels each segment "<label>: <description>" and hints what a tap does', () => {
    const { rerender } = render(<SpeedScale rangeValue={undefined} onRangeChange={() => {}} />);
    expect(segments().map((s) => s.props.accessibilityLabel)).toEqual(SEGMENTS);
    expect(segments().every((s) => s.props.accessibilityHint === 'Double-tap to start a range here')).toBe(true);

    rerender(<SpeedScale rangeValue={[1, 3]} onRangeChange={() => {}} />);
    expect(segments().map((s) => s.props.accessibilityHint)).toEqual([
      'Double-tap to start a range here',
      'Double-tap to clear the range',
      'Double-tap to clear the range',
      'Double-tap to clear the range',
      'Double-tap to start a range here',
    ]);
  });

  it('after the first tap the other segments hint that they end the range', () => {
    render(<Controlled onRangeChange={() => {}} />);
    fireEvent.press(screen.getByText('Little'));
    expect(segments().map((s) => s.props.accessibilityHint)).toEqual([
      'Double-tap to end the range here',
      'Double-tap to select just this one',
      'Double-tap to end the range here',
      'Double-tap to end the range here',
      'Double-tap to end the range here',
    ]);
  });
});
