import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react-native';
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

  it('announces Reset and Apply as buttons (M5-05 review 3)', () => {
    render(<FilterSheet visible onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeTruthy();
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

  describe('the three filters', () => {
    const headers = () => screen.getAllByRole('header').map((h) => h.props.children);
    const tabs = () => screen.getAllByRole('tab');
    const selectedTab = () =>
      tabs()
        .filter((t) => t.props.accessibilityState?.selected)
        .map((t) => within(t).getByText(/./).props.children);
    const speedSegments = () =>
      screen.getAllByRole('button').filter((b) => /^(None|Little|Some|Enough|Too much):/.test(b.props.accessibilityLabel));
    const speedSelected = () => speedSegments().map((b) => b.props.accessibilityState?.selected === true);

    it("has exactly three sections: What's here, Skate stopped, Natural speed", () => {
      render(<FilterSheet visible onClose={onClose} />);
      expect(headers()).toEqual(['Filters', "What's here", 'Skate stopped', 'Natural speed']);
    });

    it('Skate stopped is a segmented control: Any, Not stopped, Stopped; Any by default', () => {
      render(<FilterSheet visible onClose={onClose} />);
      expect(tabs().map((t) => within(t).getByText(/./).props.children)).toEqual(['Any', 'Not stopped', 'Stopped']);
      expect(selectedTab()).toEqual(['Any']);
    });

    it('Natural speed is the five-segment range scale, Any by default', () => {
      render(<FilterSheet visible onClose={onClose} />);
      expect(speedSegments()).toHaveLength(5);
      expect(speedSelected()).toEqual([false, false, false, false, false]);
      // 'Any' twice: the Skate stopped tab and the speed range's description line.
      expect(screen.getAllByText('Any')).toHaveLength(2);
    });

    it('Stopped + Rail + Little to Enough, then Apply, writes all three', () => {
      render(<FilterSheet visible onClose={onClose} />);
      fireEvent.press(screen.getByText('Stopped'));
      fireEvent.press(screen.getByText('Rail'));
      fireEvent.press(screen.getByText('Little'));
      fireEvent.press(screen.getByText('Enough'));
      expect(screen.getByText('Little to Enough')).toBeTruthy();
      fireEvent.press(screen.getByText('Apply'));

      expect(useSpotsStore.getState().filters).toEqual({
        types: ['rail'],
        stopped: true,
        natural_speed_min: 1,
        natural_speed_max: 3,
      });
      expect(onClose).toHaveBeenCalled();
    });

    it('Reset after Apply leaves DEFAULT_FILTERS', () => {
      render(<FilterSheet visible onClose={onClose} />);
      fireEvent.press(screen.getByText('Stopped'));
      fireEvent.press(screen.getByText('Rail'));
      fireEvent.press(screen.getByText('Little'));
      fireEvent.press(screen.getByText('Enough'));
      fireEvent.press(screen.getByText('Apply'));

      fireEvent.press(screen.getByText('Reset'));
      expect(useSpotsStore.getState().filters).toEqual(DEFAULT_FILTERS);
      expect(selectedTab()).toEqual(['Any']);
      expect(speedSelected()).toEqual([false, false, false, false, false]);
      expect(screen.getByRole('checkbox', { name: 'Rail' }).props.accessibilityState).toEqual(
        expect.objectContaining({ checked: false }),
      );
    });

    it('opening with stored filters pre-selects them', () => {
      useSpotsStore.setState({
        filters: { types: [FeatureType.Ledge], stopped: false, natural_speed_min: 1, natural_speed_max: 3 },
      });
      render(<FilterSheet visible onClose={onClose} />);
      expect(screen.getByRole('checkbox', { name: 'Ledge' }).props.accessibilityState).toEqual(
        expect.objectContaining({ checked: true }),
      );
      expect(selectedTab()).toEqual(['Not stopped']);
      expect(screen.getByText('Little to Enough')).toBeTruthy();
      expect(speedSelected()).toEqual([false, true, true, true, false]);
    });

    it('a stored min only (no max) shows the range up to Too much', () => {
      useSpotsStore.setState({ filters: { ...DEFAULT_FILTERS, natural_speed_min: 2 } });
      render(<FilterSheet visible onClose={onClose} />);
      expect(screen.getByText('Some to Too much')).toBeTruthy();
    });

    it('a stored speed of 0 (None) is pre-selected, not read as unset', () => {
      useSpotsStore.setState({ filters: { ...DEFAULT_FILTERS, natural_speed_min: 0, natural_speed_max: 0 } });
      render(<FilterSheet visible onClose={onClose} />);
      expect(speedSelected()).toEqual([true, false, false, false, false]);
    });

    it('choosing Any after a stored Stopped clears it on Apply', () => {
      useSpotsStore.setState({ filters: { ...DEFAULT_FILTERS, stopped: true } });
      render(<FilterSheet visible onClose={onClose} />);
      fireEvent.press(screen.getByRole('tab', { name: 'Any' }));
      fireEvent.press(screen.getByText('Apply'));
      expect(useSpotsStore.getState().filters.stopped).toBeUndefined();
    });

    it('Not stopped writes stopped: false', () => {
      render(<FilterSheet visible onClose={onClose} />);
      fireEvent.press(screen.getByText('Not stopped'));
      fireEvent.press(screen.getByText('Apply'));
      expect(useSpotsStore.getState().filters.stopped).toBe(false);
    });

    it('clearing a stored speed range writes it away on Apply', () => {
      useSpotsStore.setState({ filters: { ...DEFAULT_FILTERS, natural_speed_min: 1, natural_speed_max: 3 } });
      render(<FilterSheet visible onClose={onClose} />);
      fireEvent.press(screen.getByText('Some')); // inside the complete range: clears it
      fireEvent.press(screen.getByText('Apply'));
      const { filters } = useSpotsStore.getState();
      expect(filters.natural_speed_min).toBeUndefined();
      expect(filters.natural_speed_max).toBeUndefined();
    });
  });

  it('does not render when not visible', () => {
    render(<FilterSheet visible={false} onClose={onClose} />);
    expect(screen.queryByText('Apply')).toBeNull();
  });
});
