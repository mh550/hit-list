import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, EmptyState, HeaderTextButton, NameListSheet, SpotsBrowser } from '@/src/components';
import { EMPTY_LIST_COPY } from '@/src/components/SpotsBrowser';
import { palette, spacing } from '@/src/constants/theme';
import { useHitListActions } from '@/src/hooks/use-hit-list-actions';
import { selectListSpots, useHitListsStore, useSpotsStore } from '@/src/stores';
import { useSettingsStore } from '@/src/stores/settings-store';
import { areaLabel } from '@/src/utils/area';
import { getSpotDisplayName } from '@/src/utils/spot-name';

/** The area empty state: its spots arrive by being saved inside the circle. */
const EMPTY_AREA_COPY = {
  emptyTitle: 'No spots in this area yet',
  emptyMessage: 'Spots you save inside the circle show up here',
} as const;

/**
 * One hit list: the Spots tab's List | Map body scoped to the list's spots, plus Rename and Delete list. An area list's
 * spots are computed from its circle, so it has 'Edit area' in place of 'Remove from list'.
 */
export default function ListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const list = useHitListsStore((s) => s.lists.find((l) => l.id === id && l.deleted_at === undefined));
  const membershipBySpot = useHitListsStore((s) => s.membershipBySpot);
  const spots = useSpotsStore((s) => s.spots);
  const units = useSettingsStore((s) => s.units);
  const { renameList, deleteList, removeSpotFromList } = useHitListActions();
  const [renaming, setRenaming] = useState(false);
  // Set once Delete is confirmed: the store drops the list before router.back() runs, so 'gone' would flash.
  const [deleting, setDeleting] = useState(false);

  const listSpots = useMemo(
    () => (list ? selectListSpots(list, spots, membershipBySpot) : []),
    [list, spots, membershipBySpot],
  );

  if (!list) {
    // expo-router's Stack.Screen only sets options, so clear the list's title and Rename/Filter buttons here.
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Hit list', headerTitle: undefined, headerRight: () => null }} />
        {deleting ? null : (
          <EmptyState icon="list.bullet" title="This list is gone" message="It may have been deleted." />
        )}
      </View>
    );
  }

  const handleRename = async (name: string) => {
    try {
      await renameList(list.id, name);
      setRenaming(false);
    } catch (err) {
      // useHitListActions has logged it and put the old name back; the sheet stays open to retry.
      Alert.alert("Couldn't rename the list", 'Please try again.');
      throw err;
    }
  };

  const handleSpotLongPress = (spotId: string) => {
    const spot = listSpots.find((s) => s.id === spotId);
    if (!spot) return;
    Alert.alert(getSpotDisplayName(spot), undefined, [
      {
        text: 'Remove from list',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeSpotFromList(list.id, spotId);
          } catch {
            Alert.alert("Couldn't remove the spot", 'Please try again.');
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const confirmDelete = () => {
    Alert.alert(`Delete ${list.name}?`, 'Spots stay in your library.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteList(list.id);
          } catch {
            setDeleting(false);
            Alert.alert("Couldn't delete the list", 'Please try again.');
            return;
          }
          // Opened from a link with nothing under it: go to the Lists tab instead.
          if (router.canGoBack()) router.back();
          else router.replace('/(tabs)/lists');
        },
      },
    ]);
  };

  const isArea = list.kind === 'area';
  const areaTitle =
    isArea && list.area_radius_m !== undefined ? (
      <View
        style={styles.title}
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${list.name}, ${areaLabel(list.area_radius_m, units, list.area_place)}`}>
        <Text style={styles.titleName} numberOfLines={1}>
          {list.name}
        </Text>
        <Text style={styles.titleArea} numberOfLines={1}>
          {areaLabel(list.area_radius_m, units, list.area_place)}
        </Text>
      </View>
    ) : undefined;

  const renameButton = (
    <HeaderTextButton onPress={() => setRenaming(true)} accessibilityLabel="Rename list">
      Rename
    </HeaderTextButton>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: list.name }} />
      <SpotsBrowser
        spots={listSpots}
        {...(isArea ? EMPTY_AREA_COPY : EMPTY_LIST_COPY)}
        headerTitle={areaTitle}
        headerActions={renameButton}
        onSpotLongPress={isArea ? undefined : handleSpotLongPress}
      />
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        {isArea ? (
          <View style={styles.barButton}>
            <Button title="Edit area" variant="secondary" onPress={() => router.push(`/area?listId=${list.id}`)} />
          </View>
        ) : null}
        <View style={styles.barButton}>
          <Button title="Delete list" variant="destructive" onPress={confirmDelete} accessibilityLabel="Delete list" />
        </View>
      </View>
      <NameListSheet
        visible={renaming}
        title="Rename list"
        initialName={list.name}
        confirmLabel="Save"
        onCancel={() => setRenaming(false)}
        onSubmit={handleRename}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bottomBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.gray[200],
  },
  barButton: {
    flex: 1,
  },
  title: {
    alignItems: 'center',
    maxWidth: 220,
  },
  titleName: {
    fontSize: 17,
    fontWeight: '600',
    color: palette.gray[900],
  },
  titleArea: {
    fontSize: 12,
    color: palette.gray[500],
  },
});
