import type { ComponentProps, ReactElement } from 'react';
import { Keyboard, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { selectFilteredSpots, useMediaStore, useSpotsStore } from '@/src/stores';
import { useLocationStore } from '@/src/stores/location-store';
import { DEFAULT_FILTERS, FeatureType, SortDirection, SortField, SpotStatus } from '@/src/types';
import { getSpotDisplayName } from '@/src/utils/spot-name';
import { CITIES, createTestSpot } from './factories';

import SpotsScreen from '@/app/(tabs)/index';
import { SortChips } from '@/src/components/SortChips';

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

/** The unnamed spot's row text: "Untitled · Tacoma · <date>". */
const UNTITLED = getSpotDisplayName(unnamed);
const ROW_NAME = /^(Pier 57 rail|Library ledge|Bank to wall|Untitled)/;

/** The rendered list rows' display names, top to bottom (the FlashList mock renders every row in order). */
function rowNames(): string[] {
  return screen.queryAllByText(ROW_NAME).map((node) => node.props.children as string);
}

function searchField() {
  return screen.getByLabelText('Search spots');
}

function chip(name: 'Date' | 'Name' | 'Distance' | 'Intensity') {
  return screen.getByLabelText(new RegExp(`^Sort by ${name}`));
}

function selectedOf(node: ReturnType<typeof chip>) {
  return node.props.accessibilityState?.selected;
}

beforeEach(() => {
  useSpotsStore.setState({
    spots,
    filters: { ...DEFAULT_FILTERS },
    searchQuery: '',
    sortField: SortField.DateAdded,
    sortDirection: SortDirection.Desc,
    viewMode: 'list',
  });
  useMediaStore.setState({ mediaBySpot: {} });
  useLocationStore.setState({ currentLocation: null });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Spots tab search', () => {
  it('shows a labelled search field with the search role in list mode', () => {
    // The contract: a labelled field with a placeholder, reachable without opening the Filter sheet.
    // The search role lets VoiceOver announce it as a search field and offers the rotor shortcut.
    render(<SpotsScreen />);

    expect(searchField()).toBeTruthy();
    expect(screen.getByPlaceholderText('Search spots')).toBe(searchField());
    expect(searchField().props.accessibilityRole).toBe('search');
  });

  it('shows the search field in map mode too', () => {
    // Search filters both views, so the field must not vanish when the user switches to the map.
    useSpotsStore.setState({ viewMode: 'map' });

    render(<SpotsScreen />);

    expect(searchField()).toBeTruthy();
  });

  it("typing writes the query to the store's searchQuery", () => {
    // The field drives the store's searchQuery, which selectFilteredSpots honours.
    render(<SpotsScreen />);

    fireEvent.changeText(searchField(), 'pier');

    expect(useSpotsStore.getState().searchQuery).toBe('pier');
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

  it('a spaces-only query shows the list, not "No matching spots"', () => {
    // Whitespace is not a search (see the selectFilteredSpots trimming tests below).
    render(<SpotsScreen />);

    fireEvent.changeText(searchField(), '   ');

    expect(screen.queryByText('No matching spots')).toBeNull();
    expect(rowNames()).toHaveLength(4);
  });

  it('pressing a list row dismisses the keyboard and opens the spot', () => {
    // A raised keyboard would cover the spot screen's content while the push animates.
    const push = jest.fn();
    jest.mocked(useRouter).mockReturnValue({ push, back: jest.fn(), replace: jest.fn() } as never);
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    render(<SpotsScreen />);

    fireEvent.press(screen.getByText('Pier 57 rail'));

    expect(dismiss).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith(`/spot/${pier.id}`);
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
      useSpotsStore.setState({ searchQuery: 'pier' });

      render(<SpotsScreen />);

      expect(headerFilterLabel()).toBe('Filter spots');
    });
  });

  describe('selectFilteredSpots matches name and town', () => {
    // Fixed midday UTC so the generated label reads "Oct 13 ... PM" in practically every zone.
    const FIXED_DATE = '2026-10-13T12:00:00.000Z';
    const tacoma = createTestSpot({
      status: SpotStatus.Complete,
      generated_name: 'Tacoma',
      created_at: FIXED_DATE,
    });
    const seattlePier = createTestSpot({
      name: 'Pier 57 rail',
      generated_name: 'Seattle',
      status: SpotStatus.Complete,
      created_at: FIXED_DATE,
    });
    // Neither name nor town: nothing to match against.
    const nothing = createTestSpot({ status: SpotStatus.Complete, created_at: FIXED_DATE });
    const all = [tacoma, seattlePier, nothing];
    const search = (q: string) => selectFilteredSpots(all, DEFAULT_FILTERS, q);

    it('a named spot matches its town and its name', () => {
      // Both the user's name and the town are searched, so "seattle" finds a named spot in Seattle.
      expect(search('seattle')).toEqual([seattlePier]);
      expect(search('pier')).toEqual([seattlePier]);
    });

    it('an unnamed spot matches its town, case-insensitively', () => {
      // The town is the only searchable text an unnamed spot has.
      expect(search('TACO')).toEqual([tacoma]);
    });

    it('does not match the generated "Untitled" label', () => {
      // "untitled" would otherwise match every unnamed spot; a letter of it ("t") finds only real names and towns.
      expect(search('untitled')).toEqual([]);
      expect(search('t')).toEqual([tacoma, seattlePier]);
    });

    it('does not match the generated date or time', () => {
      // "oct" and "pm" come from the label's date/time, not from anything the user typed or the town.
      expect(search('oct')).toEqual([]);
      expect(search('pm')).toEqual([]);
    });

    it('"  pier  " behaves like "pier"', () => {
      // Stray spaces (autocomplete, paste) must not break a match.
      expect(selectFilteredSpots(spots, DEFAULT_FILTERS, '  pier  ')).toEqual([pier]);
    });

    it('a query of only spaces behaves like no search', () => {
      // Whitespace is not a search.
      expect(selectFilteredSpots(spots, DEFAULT_FILTERS, '   ')).toHaveLength(4);
    });
  });
});

describe('Spots tab sort chips', () => {
  it('orders the chips Distance, Date, Name, Intensity', () => {
    // D10: all four are reachable from the list, "distance first, since the map already shows distance".
    render(<SpotsScreen />);

    const labels = screen
      .getAllByLabelText(/^Sort by /)
      .map((node) => (node.props.accessibilityLabel as string).replace(/^Sort by (\w+).*$/, '$1'));

    expect(labels).toEqual(['Distance', 'Date', 'Name', 'Intensity']);
  });

  it('map mode shows no sort chips', () => {
    // The map has no order, so the chips would do nothing there.
    useSpotsStore.setState({ viewMode: 'map' });

    render(<SpotsScreen />);

    for (const name of ['Date', 'Name', 'Distance', 'Intensity']) {
      expect(screen.queryByLabelText(new RegExp(`^Sort by ${name}`))).toBeNull();
    }
  });

  it('defaults to Date newest first, with the Date chip selected and showing a down arrow', () => {
    // The store default (DateAdded, Desc) must be visible, and the other chips must read as inactive.
    render(<SpotsScreen />);

    expect(rowNames()).toEqual([UNTITLED, 'Library ledge', 'Bank to wall', 'Pier 57 rail']);
    expect(selectedOf(chip('Date'))).toBe(true);
    expect(chip('Date')).toHaveTextContent(/Date ↓/);
    for (const name of ['Name', 'Distance', 'Intensity'] as const) {
      expect(selectedOf(chip(name))).toBeFalsy();
      expect(chip(name)).not.toHaveTextContent(/[↑↓]/);
    }
  });

  it('tapping Name sorts A to Z with an up arrow', () => {
    // Natural first direction for Name is ascending; the unnamed spot ("Untitled ...") sorts last.
    render(<SpotsScreen />);

    fireEvent.press(chip('Name'));

    expect(rowNames()).toEqual(['Bank to wall', 'Library ledge', 'Pier 57 rail', UNTITLED]);
    expect(useSpotsStore.getState().sortField).toBe(SortField.Name);
    expect(useSpotsStore.getState().sortDirection).toBe(SortDirection.Asc);
    expect(selectedOf(chip('Name'))).toBe(true);
    expect(chip('Name')).toHaveTextContent(/Name ↑/);
    expect(selectedOf(chip('Date'))).toBeFalsy();
  });

  it('tapping the active Name chip again flips to Z to A with a down arrow', () => {
    // Tapping the active chip flips the direction; unnamed spots stay last in both directions.
    render(<SpotsScreen />);

    fireEvent.press(chip('Name'));
    fireEvent.press(chip('Name'));

    expect(rowNames()).toEqual(['Pier 57 rail', 'Library ledge', 'Bank to wall', UNTITLED]);
    expect(chip('Name')).toHaveTextContent(/Name ↓/);
  });

  it('tapping the active Date chip flips to oldest first with an up arrow', () => {
    // Flip also applies to the default chip (Date starts descending).
    render(<SpotsScreen />);

    fireEvent.press(chip('Date'));

    expect(rowNames()).toEqual(['Pier 57 rail', 'Bank to wall', 'Library ledge', UNTITLED]);
    expect(chip('Date')).toHaveTextContent(/Date ↑/);
  });

  it('disables Distance when there is no location, and pressing it leaves the sort unchanged', () => {
    // Distance needs a position: without one the chip is inert rather than silently doing nothing.
    render(<SpotsScreen />);

    expect(chip('Distance').props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(chip('Distance'));

    expect(useSpotsStore.getState().sortField).toBe(SortField.DateAdded);
    expect(useSpotsStore.getState().sortDirection).toBe(SortDirection.Desc);
    expect(rowNames()).toEqual([UNTITLED, 'Library ledge', 'Bank to wall', 'Pier 57 rail']);
  });

  it('enables Distance once a location is known, and tapping it sorts nearest first with an up arrow', () => {
    // Natural first direction for Distance is ascending (nearest first).
    useLocationStore.setState({ currentLocation: CITIES.seattle });
    render(<SpotsScreen />);

    expect(chip('Distance').props.accessibilityState?.disabled).toBeFalsy();
    fireEvent.press(chip('Distance'));

    expect(rowNames()).toEqual(['Pier 57 rail', UNTITLED, 'Library ledge', 'Bank to wall']);
    expect(selectedOf(chip('Distance'))).toBe(true);
    expect(chip('Distance')).toHaveTextContent(/Distance ↑/);
  });

  it('tapping Intensity sorts highest first with a down arrow', () => {
    // Natural first direction for Intensity is descending (the most intense spot on top).
    render(<SpotsScreen />);

    fireEvent.press(chip('Intensity'));

    expect(rowNames()).toEqual(['Library ledge', UNTITLED, 'Pier 57 rail', 'Bank to wall']);
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

  describe('row layout', () => {
    function renderChips(overrides: Partial<ComponentProps<typeof SortChips>> = {}) {
      return render(
        <SortChips
          sortField={SortField.DateAdded}
          sortDirection={SortDirection.Desc}
          hasLocation
          onSort={jest.fn()}
          {...overrides}
        />,
      );
    }

    it('does not grow: the ScrollView has flexGrow 0', () => {
      // RN gives a horizontal ScrollView flexGrow 1 / flexShrink 1, so the chip row would compete with the list for height.
      const view = renderChips();

      const style = StyleSheet.flatten(view.UNSAFE_getByType(ScrollView).props.style);

      expect(style?.flexGrow).toBe(0);
    });

    it('centres chips vertically in the row (contentContainerStyle alignItems center)', () => {
      // Without it the chips stretch to the row's height.
      const view = renderChips();

      const style = StyleSheet.flatten(view.UNSAFE_getByType(ScrollView).props.contentContainerStyle);

      expect(style?.alignItems).toBe('center');
    });
  });

  describe('accessibility', () => {
    it('inactive chips keep the plain "Sort by <Field>" label', () => {
      // The label must not repeat the direction for chips that are not sorting.
      render(<SpotsScreen />);

      for (const name of ['Distance', 'Name', 'Intensity'] as const) {
        expect(chip(name).props.accessibilityLabel).toBe(`Sort by ${name}`);
      }
    });

    it.each([
      [SortField.DateAdded, SortDirection.Desc, 'Sort by Date, newest first'],
      [SortField.DateAdded, SortDirection.Asc, 'Sort by Date, oldest first'],
      [SortField.Name, SortDirection.Asc, 'Sort by Name, A to Z'],
      [SortField.Name, SortDirection.Desc, 'Sort by Name, Z to A'],
      [SortField.Distance, SortDirection.Asc, 'Sort by Distance, nearest first'],
      [SortField.Distance, SortDirection.Desc, 'Sort by Distance, farthest first'],
      [SortField.Intensity, SortDirection.Desc, 'Sort by Intensity, highest first'],
      [SortField.Intensity, SortDirection.Asc, 'Sort by Intensity, lowest first'],
    ])('active chip for %s %s is labelled "%s"', (field, direction, label) => {
      // VoiceOver hides the visible "Date ↓" behind the label, so the label must say the direction in words.
      useLocationStore.setState({ currentLocation: CITIES.seattle });
      useSpotsStore.setState({ sortField: field, sortDirection: direction });

      render(<SpotsScreen />);

      expect(screen.getByLabelText(label)).toBeTruthy();
    });

    // Only the active chip reverses on tap, so only it says so; the disabled Distance chip explains why it is dimmed.
    it.each([
      ['the active Date chip', 'Date', 'Double-tap to reverse'],
      ['an inactive enabled chip (Name)', 'Name', undefined],
      ['the disabled Distance chip', 'Distance', 'Needs your location'],
    ] as const)('%s hints %p', (_, name, hint) => {
      render(<SpotsScreen />);

      expect(chip(name).props.accessibilityHint).toBe(hint);
    });
  });
});

describe('Spots tab no-match state', () => {
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

  describe('offers a way out', () => {
    const draft = createTestSpot({ name: 'Draft rail', status: SpotStatus.Draft });

    beforeEach(() => {
      useSpotsStore.setState({ spots: [draft], filters: { ...DEFAULT_FILTERS, show_drafts: false } });
    });

    it('filters excluding everything show a "Reset filters" action', () => {
      // Without it, the user must open the Filter sheet to find out why the list is empty.
      render(<SpotsScreen />);

      expect(screen.getByText('No matching spots')).toBeTruthy();
      expect(screen.getByText('Reset filters')).toBeTruthy();
      expect(screen.queryByText('Clear search')).toBeNull();
    });

    it('pressing "Reset filters" restores the default filters and shows the spot', () => {
      // Reset means DEFAULT_FILTERS: drafts are shown again.
      render(<SpotsScreen />);

      fireEvent.press(screen.getByText('Reset filters'));

      expect(useSpotsStore.getState().filters).toEqual(DEFAULT_FILTERS);
      expect(screen.queryByText('No matching spots')).toBeNull();
      expect(screen.getByText('Draft rail')).toBeTruthy();
    });

    it('with a search active the action is "Clear search"', () => {
      // A search with no match is cleared by clearing it, not by touching filters.
      useSpotsStore.setState({ filters: { ...DEFAULT_FILTERS }, searchQuery: 'zzz-nothing' });
      render(<SpotsScreen />);

      expect(screen.getByText('Clear search')).toBeTruthy();
      expect(screen.queryByText('Reset filters')).toBeNull();
    });
  });
});
