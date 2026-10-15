import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { FilterSheet } from '@/src/components/FilterSheet';
import { useSpotsStore } from '@/src/stores';
import { DEFAULT_FILTERS, FeatureType, GearItem } from '@/src/types';

jest.mock('@/components/ui/icon-symbol', () => {
  const { View } = jest.requireActual('react-native');
  return { IconSymbol: ({ name }: { name: string }) => <View testID={`icon-${name}`} /> };
});

describe('FilterSheet', () => {
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useSpotsStore.setState({ filters: { ...DEFAULT_FILTERS } });
  });

  it('renders feature type chips', () => {
    render(<FilterSheet visible onClose={onClose} />);
    expect(screen.getByText('rail')).toBeTruthy();
    expect(screen.getByText('ledge')).toBeTruthy();
  });

  it('renders gear filter chips', () => {
    render(<FilterSheet visible onClose={onClose} />);
    expect(screen.getByText('winch')).toBeTruthy();
  });

  it('renders show drafts toggle', () => {
    render(<FilterSheet visible onClose={onClose} />);
    expect(screen.getByText('Show Drafts')).toBeTruthy();
  });

  it('renders Reset and Apply buttons', () => {
    render(<FilterSheet visible onClose={onClose} />);
    expect(screen.getByText('Reset')).toBeTruthy();
    expect(screen.getByText('Apply')).toBeTruthy();
  });

  it('toggling a type chip updates filter state on Apply', () => {
    render(<FilterSheet visible onClose={onClose} />);
    fireEvent.press(screen.getByText('rail'));
    fireEvent.press(screen.getByText('Apply'));
    expect(useSpotsStore.getState().filters.types).toContain(FeatureType.Rail);
  });

  it('toggling gear chip updates filter state on Apply', () => {
    render(<FilterSheet visible onClose={onClose} />);
    fireEvent.press(screen.getByText('winch'));
    fireEvent.press(screen.getByText('Apply'));
    expect(useSpotsStore.getState().filters.gear).toContain(GearItem.Winch);
  });

  it('Reset clears all filters', () => {
    useSpotsStore.setState({
      filters: { ...DEFAULT_FILTERS, types: [FeatureType.Rail], gear: [GearItem.Winch] },
    });
    render(<FilterSheet visible onClose={onClose} />);
    fireEvent.press(screen.getByText('Reset'));
    expect(useSpotsStore.getState().filters.types).toHaveLength(0);
    expect(useSpotsStore.getState().filters.gear).toHaveLength(0);
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
    fireEvent.press(screen.getByText('rail'));

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
