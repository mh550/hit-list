import type { ReactElement } from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { useMediaStore, useSpotsStore } from '@/src/stores';
import { useLocationStore } from '@/src/stores/location-store';
import { DEFAULT_FILTERS, FeatureType, SortDirection, SortField, SpotStatus } from '@/src/types';
import { CITIES, createTestSpot } from './factories';

import SpotsScreen from '@/app/(tabs)/index';

// Four spots whose orders differ per sort, with the user standing in Seattle:
//   date added (newest first): unnamed, Library, Bank, Pier
//   name A to Z:               Bank, Library, Pier, Untitled
//   intensity (highest first): Library, unnamed, Pier, Bank
//   distance (nearest first):  Pier (0 km), unnamed (Tacoma ~40 km), Library (Portland ~230 km), Bank (Spokane ~370 km)
const TACOMA = { latitude: 47.2529, longitude: -122.4443 };
const pier = createTestSpot({
  name: 'Pier 57 rail',
  status: SpotStatus.Complete,
  location: CITIES.seattle,
  created_at: '2026-10-10T12:00:00.000Z',
  metadata: { intensity: 3 },
});
const library = createTestSpot({
  name: 'Library ledge',
  status: SpotStatus.Complete,
  location: CITIES.portland,
  created_at: '2026-10-12T12:00:00.000Z',
  metadata: { intensity: 5 },
});
const bank = createTestSpot({
  name: 'Bank to wall',
  status: SpotStatus.Complete,
  location: CITIES.spokane,
  created_at: '2026-10-11T12:00:00.000Z',
  metadata: { intensity: 1 },
});
const unnamed = createTestSpot({
  status: SpotStatus.Complete,
  location: TACOMA,
  generated_name: 'Tacoma',
  created_at: '2026-10-13T15:00:00.000Z',
  metadata: { intensity: 4 },
});
const spots = [pier, library, bank, unnamed];

const ROW_NAME = /^(Pier 57 rail|Library ledge|Bank to wall|Untitled)/;

/** The rendered list rows' display names, top to bottom (the FlashList mock renders every row in order). */
function rowNames(): string[] {
  return screen.queryAllByText(ROW_NAME).map((node) => {
    const text = node.props.children as string;
    return text.startsWith('Untitled') ? 'Untitled' : text;
  });
}

function searchField() {
  return screen.getByLabelText('Search spots');
}

function chip(name: 'Date' | 'Name' | 'Distance' | 'Intensity') {
  return screen.getByLabelText(`Sort by ${name}`);
}

function selectedOf(node: ReturnType<typeof chip>) {
  return node.props.accessibilityState?.selected;
}

describe('Spots tab search', () => {
  beforeEach(() => {
    useSpotsStore.setState({
      spots,
      filters: { ...DEFAULT_FILTERS },
      sortField: SortField.DateAdded,
      sortDirection: SortDirection.Desc,
      viewMode: 'list',
    });
    useMediaStore.setState({ mediaBySpot: {} });
    useLocationStore.setState({ currentLocation: null });
  });

  it('shows a search field in list mode', () => {
    // The contract: a labelled field with a placeholder, reachable without opening the Filter sheet.
    render(<SpotsScreen />);

    expect(searchField()).toBeTruthy();
    expect(screen.getByPlaceholderText('Search spots')).toBe(searchField());
  });

  it('shows the search field in map mode too', () => {
    // Search filters both views, so the field must not vanish when the user switches to the map.
    useSpotsStore.setState({ viewMode: 'map' });

    render(<SpotsScreen />);

    expect(searchField()).toBeTruthy();
  });

  it('typing writes the query to filters.search_query', () => {
    // The field drives the store's existing search_query, which selectFilteredSpots already honours.
    render(<SpotsScreen />);

    fireEvent.changeText(searchField(), 'pier');

    expect(useSpotsStore.getState().filters.search_query).toBe('pier');
  });

  it('list shows only spots whose name matches, ignoring case', () => {
    // D10: find a spot by name. Uppercase query vs a mixed-case name proves case-insensitivity.
    render(<SpotsScreen />);
    expect(rowNames()).toHaveLength(4);

    fireEvent.changeText(searchField(), 'PIER');

    expect(rowNames()).toEqual(['Pier 57 rail']);
  });

  it('map shows only the matching spot marker, and clearing the search restores all markers', () => {
    // Search must filter the map as well as the list, and an empty query must undo it.
    useSpotsStore.setState({ viewMode: 'map' });
    render(<SpotsScreen />);
    expect(screen.getAllByTestId(/^spot-marker-/)).toHaveLength(4);

    fireEvent.changeText(searchField(), 'pier');
    expect(screen.getAllByTestId(/^spot-marker-/)).toHaveLength(1);
    expect(screen.getByTestId(`spot-marker-${pier.id}`)).toBeTruthy();

    fireEvent.changeText(searchField(), '');
    expect(screen.getAllByTestId(/^spot-marker-/)).toHaveLength(4);
  });

  it('keeps the search when switching List to Map to List, and clearing restores all four rows', () => {
    // One search, both views: the query lives in the store, not in a view-local state.
    render(<SpotsScreen />);
    fireEvent.changeText(searchField(), 'pier');

    fireEvent.press(screen.getByText('Map'));
    expect(screen.getAllByTestId(/^spot-marker-/)).toHaveLength(1);
    fireEvent.press(screen.getByText('List'));
    expect(rowNames()).toEqual(['Pier 57 rail']);

    fireEvent.changeText(searchField(), '');
    expect(rowNames()).toHaveLength(4);
  });

  it('shows "No matching spots", not the first-run empty state, when the search matches nothing', () => {
    // Spots exist, so "No Spots Yet / Tap + to add your first spot" would be wrong. The field stays so the user can clear it.
    render(<SpotsScreen />);

    fireEvent.changeText(searchField(), 'zzz-nothing');

    expect(screen.getByText('No matching spots')).toBeTruthy();
    expect(screen.queryByText('No Spots Yet')).toBeNull();
    expect(searchField()).toBeTruthy();
  });

  it('shows "No matching spots" when the filters (not the search) exclude every spot', () => {
    // The plan covers "search or filters": no spot here has a rail feature type.
    useSpotsStore.setState({ filters: { ...DEFAULT_FILTERS, types: [FeatureType.Rail] } });

    render(<SpotsScreen />);

    expect(screen.getByText('No matching spots')).toBeTruthy();
    expect(screen.queryByText('No Spots Yet')).toBeNull();
  });

  it('still shows "No Spots Yet" when the store has no spots at all', () => {
    // First-run state is unchanged: only an empty store gets the add-your-first-spot prompt.
    useSpotsStore.setState({ spots: [] });

    render(<SpotsScreen />);

    expect(screen.getByText('No Spots Yet')).toBeTruthy();
    expect(screen.queryByText('No matching spots')).toBeNull();
  });

  describe('header Filter button badge', () => {
    // Stack.Screen is a string host mock in jest.setup, so the header never renders. We read the
    // `headerRight` option off the mocked element and render it, which shows what the user would see.
    function headerFilterLabel(): string {
      const { options } = screen.UNSAFE_getByType('Stack.Screen' as never).props as {
        options: { headerRight: () => ReactElement };
      };
      const header = render(options.headerRight());
      const label = header.getByRole('button').props.accessibilityLabel as string;
      header.unmount();
      return label;
    }

    it('shows the badge for a real filter (control: proves the header is observable)', () => {
      // Without this control, a passing "no badge while searching" test could just be reading nothing.
      useSpotsStore.setState({ filters: { ...DEFAULT_FILTERS, show_drafts: false } });

      render(<SpotsScreen />);

      expect(headerFilterLabel()).toBe('Filter spots, 1 active');
    });

    it('does not gain a badge while searching', () => {
      // Search has its own visible field, so counting it in "Filter (n)" would be confusing.
      // Set via the store so this test depends only on the badge, not on the search field existing.
      useSpotsStore.setState({ filters: { ...DEFAULT_FILTERS, search_query: 'pier' } });

      render(<SpotsScreen />);

      expect(headerFilterLabel()).toBe('Filter spots');
    });
  });
});

describe('Spots tab sort chips', () => {
  beforeEach(() => {
    useSpotsStore.setState({
      spots,
      filters: { ...DEFAULT_FILTERS },
      sortField: SortField.DateAdded,
      sortDirection: SortDirection.Desc,
      viewMode: 'list',
    });
    useMediaStore.setState({ mediaBySpot: {} });
    useLocationStore.setState({ currentLocation: null });
  });

  it('list mode shows the four sort chips', () => {
    // D10: Distance / Date / Name / Intensity are all reachable from the list.
    render(<SpotsScreen />);

    for (const name of ['Date', 'Name', 'Distance', 'Intensity'] as const) {
      expect(screen.getByLabelText(`Sort by ${name}`)).toBeTruthy();
    }
  });

  it('map mode shows no sort chips', () => {
    // The map has no order, so the chips would do nothing there.
    useSpotsStore.setState({ viewMode: 'map' });

    render(<SpotsScreen />);

    for (const name of ['Date', 'Name', 'Distance', 'Intensity']) {
      expect(screen.queryByLabelText(`Sort by ${name}`)).toBeNull();
    }
  });

  it('defaults to Date newest first, with the Date chip selected and showing a down arrow', () => {
    // The store default (DateAdded, Desc) must be visible, and the other chips must read as inactive.
    render(<SpotsScreen />);

    expect(rowNames()).toEqual(['Untitled', 'Library ledge', 'Bank to wall', 'Pier 57 rail']);
    expect(selectedOf(chip('Date'))).toBe(true);
    expect(chip('Date')).toHaveTextContent(/Date ↓/);
    for (const name of ['Name', 'Distance', 'Intensity'] as const) {
      expect(chip(name).props.accessibilityState?.selected).toBeFalsy();
      expect(chip(name)).not.toHaveTextContent(/[↑↓]/);
    }
  });

  it('tapping Name sorts A to Z with an up arrow', () => {
    // Natural first direction for Name is ascending; the unnamed spot ("Untitled ...") sorts last.
    render(<SpotsScreen />);

    fireEvent.press(chip('Name'));

    expect(rowNames()).toEqual(['Bank to wall', 'Library ledge', 'Pier 57 rail', 'Untitled']);
    expect(useSpotsStore.getState().sortField).toBe(SortField.Name);
    expect(useSpotsStore.getState().sortDirection).toBe(SortDirection.Asc);
    expect(selectedOf(chip('Name'))).toBe(true);
    expect(chip('Name')).toHaveTextContent(/Name ↑/);
    expect(selectedOf(chip('Date'))).toBeFalsy();
  });

  it('tapping the active Name chip again flips to Z to A with a down arrow', () => {
    // Tapping the active chip flips the direction.
    render(<SpotsScreen />);

    fireEvent.press(chip('Name'));
    fireEvent.press(chip('Name'));

    expect(rowNames()).toEqual(['Untitled', 'Pier 57 rail', 'Library ledge', 'Bank to wall']);
    expect(chip('Name')).toHaveTextContent(/Name ↓/);
  });

  it('tapping the active Date chip flips to oldest first with an up arrow', () => {
    // Flip also applies to the default chip (Date starts descending).
    render(<SpotsScreen />);

    fireEvent.press(chip('Date'));

    expect(rowNames()).toEqual(['Pier 57 rail', 'Bank to wall', 'Library ledge', 'Untitled']);
    expect(chip('Date')).toHaveTextContent(/Date ↑/);
  });

  it('disables Distance when there is no location, and pressing it leaves the sort unchanged', () => {
    // Distance needs a position: without one the chip is inert rather than silently doing nothing.
    render(<SpotsScreen />);

    expect(chip('Distance').props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(chip('Distance'));

    expect(useSpotsStore.getState().sortField).toBe(SortField.DateAdded);
    expect(useSpotsStore.getState().sortDirection).toBe(SortDirection.Desc);
    expect(rowNames()).toEqual(['Untitled', 'Library ledge', 'Bank to wall', 'Pier 57 rail']);
  });

  it('enables Distance once a location is known, and tapping it sorts nearest first with an up arrow', () => {
    // Natural first direction for Distance is ascending (nearest first).
    useLocationStore.setState({ currentLocation: CITIES.seattle });
    render(<SpotsScreen />);

    expect(chip('Distance').props.accessibilityState?.disabled).toBeFalsy();
    fireEvent.press(chip('Distance'));

    expect(rowNames()).toEqual(['Pier 57 rail', 'Untitled', 'Library ledge', 'Bank to wall']);
    expect(selectedOf(chip('Distance'))).toBe(true);
    expect(chip('Distance')).toHaveTextContent(/Distance ↑/);
  });

  it('tapping Intensity sorts highest first with a down arrow', () => {
    // Natural first direction for Intensity is descending (the most intense spot on top).
    render(<SpotsScreen />);

    fireEvent.press(chip('Intensity'));

    expect(rowNames()).toEqual(['Library ledge', 'Untitled', 'Pier 57 rail', 'Bank to wall']);
    expect(selectedOf(chip('Intensity'))).toBe(true);
    expect(chip('Intensity')).toHaveTextContent(/Intensity ↓/);
  });

  it('keeps the chosen sort when the search narrows the list', () => {
    // Search and sort compose: "r" matches only Library ledge and Pier 57 rail, which keep their Name order.
    render(<SpotsScreen />);
    fireEvent.press(chip('Name'));

    fireEvent.changeText(searchField(), 'r');

    expect(rowNames()).toEqual(['Library ledge', 'Pier 57 rail']);
  });
});
