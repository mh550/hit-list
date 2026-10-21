import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, fireEvent, within } from '@testing-library/react-native';

import { SpeedScale } from '@/src/components';
import { palette } from '@/src/constants/theme';

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
