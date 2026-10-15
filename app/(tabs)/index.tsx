import { useCallback, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StyleSheet, View, Pressable, Text } from 'react-native';
import { FlashList } from '@shopify/flash-list';

import {
  useSpotsStore,
  useMediaStore,
  selectFilteredSpots,
  selectSortedSpots,
  selectActiveFilterCount,
} from '@/src/stores';
import { useLocationStore } from '@/src/stores/location-store';
import { useSettingsStore } from '@/src/stores/settings-store';
import { SpotListItem } from '@/src/components/SpotListItem';
import { EmptyState } from '@/src/components/EmptyState';
import { FilterSheet } from '@/src/components/FilterSheet';
import { SegmentedControl } from '@/src/components/SegmentedControl';
import { SpotMap } from '@/src/components/SpotMap';
import { featureLabel, getSpotDisplayName } from '@/src/utils/spot-name';
import { resolvePhotoUri } from '@/src/utils/photo-storage';
import { primaryPhoto } from '@/src/utils/spot-photos';
import { haversineDistance, formatDistance } from '@/src/utils/geo';
import { SpotStatus, UnitSystem } from '@/src/types';
import type { Spot } from '@/src/types';
import type { ViewMode } from '@/src/stores/spots-store';
import { palette, spacing } from '@/src/constants/theme';

export default function SpotsScreen() {
  const router = useRouter();
  const spots = useSpotsStore((s) => s.spots);
  const filters = useSpotsStore((s) => s.filters);
  const sortField = useSpotsStore((s) => s.sortField);
  const sortDirection = useSpotsStore((s) => s.sortDirection);
  const viewMode = useSpotsStore((s) => s.viewMode);
  const setViewMode = useSpotsStore((s) => s.setViewMode);
  const currentLocation = useLocationStore((s) => s.currentLocation);
  const units = useSettingsStore((s) => s.units);
  const mediaBySpot = useMediaStore((s) => s.mediaBySpot);

  const [filterVisible, setFilterVisible] = useState(false);
  const activeFilterCount = selectActiveFilterCount(filters);

  const filtered = selectFilteredSpots(spots, filters);
  const sorted = selectSortedSpots(filtered, sortField, sortDirection, currentLocation ?? undefined);

  const handleSpotPress = useCallback(
    (id: string) => {
      router.push(`/spot/${id}` as `/spot/${string}`);
    },
    [router],
  );

  const getDistance = useCallback(
    (spot: Spot): string | undefined => {
      if (!currentLocation) return undefined;
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
          isDraft={item.status === SpotStatus.Draft}
          onPress={handleSpotPress}
        />
      );
    },
    [handleSpotPress, getDistance, mediaBySpot],
  );

  const keyExtractor = useCallback((item: Spot) => item.id, []);

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
      </View>
      <View style={styles.body}>
        {viewMode === 'map' ? (
          <SpotMap spots={sorted} currentLocation={currentLocation} onOpenSpot={handleSpotPress} />
        ) : null}
        {viewMode === 'list' && sorted.length === 0 ? (
          <EmptyState
            title="No Spots Yet"
            message="Tap the + button to add your first spot"
            actionLabel="Add Spot"
            onAction={() => router.push('/add/camera')}
          />
        ) : null}
        {viewMode === 'list' && sorted.length > 0 ? (
          <FlashList data={sorted} renderItem={renderItem} keyExtractor={keyExtractor} />
        ) : null}
      </View>
      <Pressable
        style={styles.fab}
        onPress={() => router.push('/add/camera')}
        accessibilityLabel="Add new spot"
        accessibilityRole="button">
        <Text style={styles.fabText}>+</Text>
      </Pressable>
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
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 32,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.blue[500],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  fabText: {
    fontSize: 28,
    color: palette.white,
    fontWeight: '600',
  },
});
