import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Keyboard, StyleSheet, View, TextInput } from 'react-native';
import { FlashList } from '@shopify/flash-list';

import {
  useSpotsStore,
  useMediaStore,
  selectFilteredSpots,
  selectSortedSpots,
  selectEffectiveSort,
  selectActiveFilterCount,
} from '@/src/stores';
import { useLocationStore } from '@/src/stores/location-store';
import { useSettingsStore } from '@/src/stores/settings-store';
import { SpotListItem } from '@/src/components/SpotListItem';
import { EmptyState } from '@/src/components/EmptyState';
import { HeaderTextButton } from '@/src/components/HeaderTextButton';
import { FilterSheet } from '@/src/components/FilterSheet';
import { SegmentedControl } from '@/src/components/SegmentedControl';
import { SpotMap } from '@/src/components/SpotMap';
import { SortChips } from '@/src/components/SortChips';
import { useCurrentLocation } from '@/src/hooks/use-current-location';
import { featureTypesLabel, getSpotDisplayName } from '@/src/utils/spot-name';
import { resolvePhotoUri } from '@/src/utils/photo-storage';
import { primaryPhoto } from '@/src/utils/spot-photos';
import { haversineDistance, formatDistance, isKnownLocation } from '@/src/utils/geo';
import { SortField, UnitSystem } from '@/src/types';
import type { Spot } from '@/src/types';
import type { ViewMode } from '@/src/stores/spots-store';
import { palette, radius, spacing } from '@/src/constants/theme';

interface SpotsBrowserProps {
  /** The set to browse: all spots, or a hit list's. Filters, search and sort (one set in the store, D52) narrow it. */
  spots: Spot[];
  /** Shown in List view when `spots` is empty. */
  emptyTitle: string;
  emptyMessage: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  /** Rendered above the mode bar. */
  aboveList?: ReactNode;
  /** The list's bottom padding, so the last rows can scroll clear of anything floating over it. */
  contentBottomInset?: number;
  /** Rendered in the header before the Filter button (a screen's own headerRight would replace Filter). */
  headerActions?: ReactNode;
  /** Overrides the header's title text ('2 selected'); undefined shows the screen's title. */
  headerTitle?: string;
  /** The header's left side (the Spots tab's 'Select' / 'Cancel'); undefined keeps the default (a back button). */
  headerLeft?: ReactNode;
  onSpotLongPress?: (id: string) => void;
  /** Replaces a row tap's default (open the spot). */
  onSpotPress?: (id: string) => void;
  /** Defined = select mode: rows render as checkboxes, checked when their id is in the set. */
  selectedIds?: ReadonlySet<string>;
}

/** The empty state of a hit list with no spots (the list screen, and the Spots tab with that list picked). */
export const EMPTY_LIST_COPY = {
  emptyTitle: 'No spots in this list yet',
  emptyMessage: "Add from a spot's page or select spots on the Spots tab",
} as const;

/**
 * The List | Map body of the Spots tab, reusable for any set of spots: mode toggle, search, sort chips, the list or
 * the map, the empty states, and the header Filter button with its sheet. Reads and writes the one spots store.
 */
export function SpotsBrowser({
  spots,
  emptyTitle,
  emptyMessage,
  emptyActionLabel,
  onEmptyAction,
  aboveList,
  contentBottomInset = spacing.md,
  headerActions,
  headerTitle,
  headerLeft,
  onSpotLongPress,
  onSpotPress,
  selectedIds,
}: SpotsBrowserProps) {
  const router = useRouter();
  useCurrentLocation(); // distances in the list and the map's own position (bug 5)
  const filters = useSpotsStore((s) => s.filters);
  const searchQuery = useSpotsStore((s) => s.searchQuery);
  const storedSortField = useSpotsStore((s) => s.sortField);
  const storedSortDirection = useSpotsStore((s) => s.sortDirection);
  const sortChosen = useSpotsStore((s) => s.sortChosen);
  const viewMode = useSpotsStore((s) => s.viewMode);
  const setViewMode = useSpotsStore((s) => s.setViewMode);
  const resetFilters = useSpotsStore((s) => s.resetFilters);
  const setSearchQuery = useSpotsStore((s) => s.setSearchQuery);
  const setSort = useSpotsStore((s) => s.setSort);
  const currentLocation = useLocationStore((s) => s.currentLocation);
  const units = useSettingsStore((s) => s.units);
  const mediaBySpot = useMediaStore((s) => s.mediaBySpot);

  const [filterVisible, setFilterVisible] = useState(false);
  const activeFilterCount = selectActiveFilterCount(filters);
  // Distance, nearest first, once the position is known and until the user taps a chip (D14).
  const { sortField, sortDirection } = selectEffectiveSort(
    { sortField: storedSortField, sortDirection: storedSortDirection, sortChosen },
    currentLocation != null,
  );

  // The map takes the filtered spots: order doesn't matter to it, and a new array would re-cluster its markers.
  const filtered = useMemo(
    () => selectFilteredSpots(spots, filters, searchQuery),
    [spots, filters, searchQuery],
  );
  // Location only matters to the Distance sort; other sorts ignore location updates.
  const sortLocation = sortField === SortField.Distance ? currentLocation : null;
  const sorted = useMemo(
    () => selectSortedSpots(filtered, sortField, sortDirection, sortLocation ?? undefined),
    [filtered, sortField, sortDirection, sortLocation],
  );

  const openSpot = useCallback(
    (id: string) => {
      Keyboard.dismiss(); // a raised keyboard would cover the spot screen while it animates in
      router.push(`/spot/${id}` as `/spot/${string}`);
    },
    [router],
  );
  const handleRowPress = onSpotPress ?? openSpot;

  const getDistance = useCallback(
    (spot: Spot): string | undefined => {
      if (!currentLocation || !isKnownLocation(spot.location)) return undefined;
      const km = haversineDistance(currentLocation, spot.location);
      return formatDistance(km, units === UnitSystem.Imperial);
    },
    [currentLocation, units],
  );

  const renderItem = useCallback(
    ({ item }: { item: Spot }) => {
      const thumbnail = primaryPhoto(item, mediaBySpot[item.id]);
      return (
        <SpotListItem
          id={item.id}
          displayName={getSpotDisplayName(item)}
          thumbnailUri={thumbnail ? resolvePhotoUri(thumbnail.file_path) : undefined}
          featureType={featureTypesLabel(item)}
          stopped={item.stopped}
          naturalSpeed={item.natural_speed}
          distance={getDistance(item)}
          onPress={handleRowPress}
          onLongPress={onSpotLongPress}
          selectable={selectedIds !== undefined}
          selected={selectedIds?.has(item.id) ?? false}
        />
      );
    },
    [handleRowPress, onSpotLongPress, selectedIds, getDistance, mediaBySpot],
  );

  const keyExtractor = useCallback((item: Spot) => item.id, []);

  // "No matching spots" offers the way out: clear the search if there is one (whitespace is not a search;
  // selectFilteredSpots trims the same way), otherwise reset the filters.
  const noMatchAction = searchQuery.trim() !== ''
    ? { label: 'Clear search', run: () => setSearchQuery('') }
    : activeFilterCount > 0
      ? { label: 'Reset filters', run: resetFilters }
      : undefined;

  const filterButton = (
    <HeaderTextButton
      onPress={() => setFilterVisible(true)}
      accessibilityLabel={`Filter spots${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ''}`}
      emphasized={activeFilterCount > 0}>
      {`Filter${activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}`}
    </HeaderTextButton>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        // These options always carry headerTitle and headerLeft (undefined un-sets them, as '2 selected' needs), so
        // they overwrite a layout's; a screen sets them through these props, not its own Stack.Screen.
        options={{
          headerTitle,
          headerLeft: headerLeft === undefined ? undefined : () => headerLeft,
          headerRight: () => (
            <View style={styles.headerButtons}>
              {headerActions}
              {filterButton}
            </View>
          ),
        }}
      />
      {aboveList}
      <View style={styles.modeBar}>
        <SegmentedControl
          segments={VIEW_MODES}
          selectedValue={viewMode}
          onValueChange={setViewMode}
        />
        {/* Search filters both views (it writes the store's searchQuery), so it sits above them. */}
        <TextInput
          style={styles.search}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search spots"
          placeholderTextColor={palette.gray[500]}
          accessibilityLabel="Search spots"
          accessibilityRole="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>
      {viewMode === 'list' ? (
        <SortChips
          sortField={sortField}
          sortDirection={sortDirection}
          hasLocation={currentLocation != null}
          onSort={setSort}
        />
      ) : null}
      <View style={styles.body}>
        {viewMode === 'map' ? (
          <SpotMap spots={filtered} currentLocation={currentLocation} onOpenSpot={openSpot} />
        ) : null}
        {viewMode === 'list' && spots.length === 0 ? (
          <EmptyState
            title={emptyTitle}
            message={emptyMessage}
            actionLabel={emptyActionLabel}
            onAction={onEmptyAction}
          />
        ) : null}
        {viewMode === 'list' && spots.length > 0 && sorted.length === 0 ? (
          <EmptyState
            icon="magnifyingglass"
            title="No matching spots"
            message="Try a different search or clear the filters"
            actionLabel={noMatchAction?.label}
            onAction={noMatchAction?.run}
          />
        ) : null}
        {viewMode === 'list' && sorted.length > 0 ? (
          <FlashList
            data={sorted}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            extraData={selectedIds}
            contentContainerStyle={{ paddingBottom: contentBottomInset }}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          />
        ) : null}
      </View>
      <FilterSheet visible={filterVisible} onClose={() => setFilterVisible(false)} />
    </View>
  );
}

const VIEW_MODES: { label: string; value: ViewMode }[] = [
  { label: 'List', value: 'list' },
  { label: 'Map', value: 'map' },
];

const styles = StyleSheet.create({
  modeBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  search: {
    backgroundColor: palette.gray[100],
    borderRadius: radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: palette.gray[900],
  },
  body: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
