import { useCallback, useMemo, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Keyboard, StyleSheet, View, Pressable, Text, TextInput } from 'react-native';
import { FlashList } from '@shopify/flash-list';

import { IconSymbol } from '@/components/ui/icon-symbol';

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
import { FilterSheet } from '@/src/components/FilterSheet';
import { SegmentedControl } from '@/src/components/SegmentedControl';
import { SpotMap } from '@/src/components/SpotMap';
import { SortChips } from '@/src/components/SortChips';
import { useCurrentLocation } from '@/src/hooks/use-current-location';
import { featureLabel, getSpotDisplayName } from '@/src/utils/spot-name';
import { resolvePhotoUri } from '@/src/utils/photo-storage';
import { primaryPhoto } from '@/src/utils/spot-photos';
import { haversineDistance, formatDistance, isKnownLocation } from '@/src/utils/geo';
import { SortField, UnitSystem } from '@/src/types';
import type { Spot } from '@/src/types';
import type { ViewMode } from '@/src/stores/spots-store';
import { palette, radius, spacing } from '@/src/constants/theme';

// Floating action column (bottom-right): shared by its style and the list's bottom padding so the two
// cannot drift. The list pads past the column's full height so the last rows scroll clear of it.
const FAB_BOTTOM = 32;
const FAB_SIZE = 56;
const FAB_SECONDARY_SIZE = 44;
const FAB_GAP = spacing.md;
const LIST_BOTTOM_MARGIN = spacing.md;
const LIST_BOTTOM_PADDING = FAB_BOTTOM + FAB_SIZE + FAB_GAP + FAB_SECONDARY_SIZE + LIST_BOTTOM_MARGIN;

export default function SpotsScreen() {
  const router = useRouter();
  useCurrentLocation(); // distances in the list and the map's own position (bug 5)
  const spots = useSpotsStore((s) => s.spots);
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

  const handleSpotPress = useCallback(
    (id: string) => {
      Keyboard.dismiss(); // a raised keyboard would cover the spot screen while it animates in
      router.push(`/spot/${id}` as `/spot/${string}`);
    },
    [router],
  );

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
          featureType={featureLabel(item)}
          difficulty={item.feature.difficulty as 1 | 2 | 3 | 4 | 5 | undefined}
          distance={getDistance(item)}
          onPress={handleSpotPress}
        />
      );
    },
    [handleSpotPress, getDistance, mediaBySpot],
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
    <Pressable
      onPress={() => setFilterVisible(true)}
      hitSlop={8}
      accessibilityLabel={`Filter spots${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ''}`}
      accessibilityRole="button"
      style={styles.filterButton}>
      <Text style={[styles.filterText, activeFilterCount > 0 && styles.filterTextActive]}>
        Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
      </Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerRight: () => filterButton }} />
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
          <SpotMap spots={filtered} currentLocation={currentLocation} onOpenSpot={handleSpotPress} />
        ) : null}
        {viewMode === 'list' && spots.length === 0 ? (
          <EmptyState
            title="No Spots Yet"
            message="Tap the + button to add your first spot, or import from your photos"
            actionLabel="Add Spot"
            onAction={() => router.push('/add/camera')}
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
            contentContainerStyle={styles.listContent}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          />
        ) : null}
      </View>
      <View style={styles.fabColumn}>
        <Pressable
          style={[styles.fabShadow, styles.fabSecondary]}
          onPress={() => router.push('/import')}
          accessibilityLabel="Import photos"
          accessibilityRole="button">
          <IconSymbol name="photo.on.rectangle" size={22} color={palette.blue[500]} />
        </Pressable>
        <Pressable
          style={[styles.fabShadow, styles.fab]}
          onPress={() => router.push('/add/camera')}
          accessibilityLabel="Add new spot"
          accessibilityRole="button">
          <Text style={styles.fabText}>+</Text>
        </Pressable>
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
  filterButton: {
    paddingHorizontal: spacing.sm,
  },
  filterText: {
    fontSize: 16,
    color: palette.blue[500],
    fontWeight: '500',
  },
  filterTextActive: {
    fontWeight: '700',
  },
  // Floating actions: the secondary "Import photos" button stacked above the "+" FAB (D12).
  fabColumn: {
    position: 'absolute',
    bottom: FAB_BOTTOM,
    right: 32,
    alignItems: 'center',
    gap: FAB_GAP,
  },
  listContent: {
    paddingBottom: LIST_BOTTOM_PADDING,
  },
  fabShadow: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: palette.blue[500],
  },
  fabSecondary: {
    width: FAB_SECONDARY_SIZE,
    height: FAB_SECONDARY_SIZE,
    borderRadius: FAB_SECONDARY_SIZE / 2,
    backgroundColor: palette.white,
  },
  fabText: {
    fontSize: 28,
    color: palette.white,
    fontWeight: '600',
  },
});
