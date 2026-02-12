import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, View, Pressable, Text } from 'react-native';
import { FlashList } from '@shopify/flash-list';

import { useSpotsStore, selectFilteredSpots, selectSortedSpots } from '@/src/stores';
import { useLocationStore } from '@/src/stores/location-store';
import { useSettingsStore } from '@/src/stores/settings-store';
import { SpotListItem } from '@/src/components/SpotListItem';
import { EmptyState } from '@/src/components/EmptyState';
import { getSpotDisplayName } from '@/src/utils/spot-name';
import { haversineDistance, formatDistance } from '@/src/utils/geo';
import { SpotStatus, UnitSystem } from '@/src/types';
import type { Spot } from '@/src/types';
import { palette } from '@/src/constants/theme';

export default function SpotsScreen() {
  const router = useRouter();
  const spots = useSpotsStore((s) => s.spots);
  const filters = useSpotsStore((s) => s.filters);
  const sortField = useSpotsStore((s) => s.sortField);
  const sortDirection = useSpotsStore((s) => s.sortDirection);
  const currentLocation = useLocationStore((s) => s.currentLocation);
  const units = useSettingsStore((s) => s.units);

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
    ({ item }: { item: Spot }) => (
      <SpotListItem
        id={item.id}
        displayName={getSpotDisplayName(item)}
        featureType={item.feature.type?.replace(/_/g, ' ')}
        difficulty={item.feature.difficulty as 1 | 2 | 3 | 4 | 5 | undefined}
        distance={getDistance(item)}
        isDraft={item.status === SpotStatus.Draft}
        onPress={handleSpotPress}
      />
    ),
    [handleSpotPress, getDistance],
  );

  const keyExtractor = useCallback((item: Spot) => item.id, []);

  if (sorted.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          title="No Spots Yet"
          message="Tap the + button to add your first spot"
          actionLabel="Add Spot"
          onAction={() => router.push('/add/camera')}
        />
        <Pressable
          style={styles.fab}
          onPress={() => router.push('/add/camera')}
          accessibilityLabel="Add new spot"
          accessibilityRole="button">
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlashList
        data={sorted}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
      />
      <Pressable
        style={styles.fab}
        onPress={() => router.push('/add/camera')}
        accessibilityLabel="Add new spot"
        accessibilityRole="button">
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
