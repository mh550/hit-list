import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { FilterSheet } from '@/src/components/FilterSheet';
import { useSpotsStore } from '@/src/stores';
import { DEFAULT_FILTERS, FeatureType } from '@/src/types';

describe('FilterSheet', () => {
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useSpotsStore.setState({ filters: { ...DEFAULT_FILTERS }, searchQuery: '' });
  });

  it("offers exactly the eight What's here chips (no Other)", () => {
    render(<FilterSheet visible onClose={onClose} />);
    expect(screen.getByText("What's here")).toBeTruthy();
    const labels = ['Rail', 'Ledge', 'Bank', 'Hip', 'Stair set', 'Gap', 'Wall ride', 'Quarter pipe'];
    for (const label of labels) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText(/^other$/i)).toBeNull();
    expect(screen.getAllByRole('checkbox')).toHaveLength(8);
  });

  it('has no gear, build or drafts filter (D20, D22)', () => {
    render(<FilterSheet visible onClose={onClose} />);
    expect(screen.queryByText(/gear i have/i)).toBeNull();
    expect(screen.queryByText(/exclude build/i)).toBeNull();
    expect(screen.queryByText(/show drafts/i)).toBeNull();
    expect(screen.queryByText('winch')).toBeNull();
  });

  it('renders Reset and Apply buttons', () => {
    render(<FilterSheet visible onClose={onClose} />);
    expect(screen.getByText('Reset')).toBeTruthy();
    expect(screen.getByText('Apply')).toBeTruthy();
  });

  it('toggling a type chip updates filter state on Apply', () => {
    render(<FilterSheet visible onClose={onClose} />);
    fireEvent.press(screen.getByText('Rail'));
    fireEvent.press(screen.getByText('Apply'));
    expect(useSpotsStore.getState().filters.types).toContain(FeatureType.Rail);
  });

  it('Reset clears all filters', () => {
    useSpotsStore.setState({
      filters: { ...DEFAULT_FILTERS, types: [FeatureType.Rail], stopped: true },
    });
    render(<FilterSheet visible onClose={onClose} />);
    fireEvent.press(screen.getByText('Reset'));
    expect(useSpotsStore.getState().filters).toEqual(DEFAULT_FILTERS);
  });

  it('Reset and Apply clear the filters but leave the search alone', () => {
    // Search has its own field on the Spots tab, so the filter sheet must not wipe what the user typed.
    useSpotsStore.setState({
      filters: { ...DEFAULT_FILTERS, types: [FeatureType.Rail], stopped: false },
      searchQuery: 'pier',
    });
    render(<FilterSheet visible onClose={onClose} />);
    fireEvent.press(screen.getByText('Reset'));
    expect(useSpotsStore.getState().filters).toEqual(DEFAULT_FILTERS);
    expect(useSpotsStore.getState().searchQuery).toBe('pier');
    fireEvent.press(screen.getByText('Apply'));
    expect(useSpotsStore.getState().filters).toEqual(DEFAULT_FILTERS);
    expect(useSpotsStore.getState().searchQuery).toBe('pier');
  });

  it('Apply calls onClose', () => {
    render(<FilterSheet visible onClose={onClose} />);
    fireEvent.press(screen.getByText('Apply'));
    expect(onClose).toHaveBeenCalled();
  });

  it('re-reads the store filters each time it opens', () => {
    const { rerender } = render(<FilterSheet visible={false} onClose={onClose} />);
    useSpotsStore.setState({ filters: { ...DEFAULT_FILTERS, types: [FeatureType.Rail] } });

    rerender(<FilterSheet visible onClose={onClose} />);
    fireEvent.press(screen.getByText('Apply'));

    expect(useSpotsStore.getState().filters.types).toEqual([FeatureType.Rail]);
  });

  it('drops unsaved edits when the sheet is closed and reopened', () => {
    const { rerender } = render(<FilterSheet visible onClose={onClose} />);
    fireEvent.press(screen.getByText('Rail'));

    rerender(<FilterSheet visible={false} onClose={onClose} />);
    rerender(<FilterSheet visible onClose={onClose} />);
    fireEvent.press(screen.getByText('Apply'));

    expect(useSpotsStore.getState().filters.types).toEqual([]);
  });

  it('does not render when not visible', () => {
    render(<FilterSheet visible={false} onClose={onClose} />);
    expect(screen.queryByText('Apply')).toBeNull();
  });
});
