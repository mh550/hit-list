import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { RefreshControl, StyleSheet, View, Pressable, Text } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { IconSymbol } from '@/components/ui/icon-symbol';

import { selectListSpots, useHitListsStore, useSpotsStore } from '@/src/stores';
import { EMPTY_AREA_COPY, EMPTY_LIST_COPY, SpotsBrowser } from '@/src/components/SpotsBrowser';
import { HeaderTextButton } from '@/src/components/HeaderTextButton';
import { AddToListSheet } from '@/src/components/AddToListSheet';
import { SendSheet } from '@/src/components/SendSheet';
import { ListPickerChips } from '@/src/components/ListPickerChips';
import { useAuthStore } from '@/src/stores/auth-store';
import { syncNow } from '@/src/sync/engine';
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
  const db = useSQLiteContext();
  const signedIn = useAuthStore((s) => s.status === 'signed_in');
  // The spinner is the rider's pull only (syncNow never rejects); background syncs show nothing here.
  const [pulling, setPulling] = useState(false);
  const pullToSync = () => {
    setPulling(true);
    void syncNow(db).finally(() => setPulling(false));
  };
  const allSpots = useSpotsStore((s) => s.spots);
  const viewMode = useSpotsStore((s) => s.viewMode);
  const lists = useHitListsStore((s) => s.lists);
  const membershipBySpot = useHitListsStore((s) => s.membershipBySpot);
  const activeListId = useHitListsStore((s) => s.activeListId);
  // The picker's scope: a live list's spots, or every spot ('My spots', or an id no longer among the lists).
  const activeList = lists.find((l) => l.id === activeListId && l.deleted_at === undefined);
  const spots = useMemo(
    () => (activeList ? selectListSpots(activeList, allSpots, membershipBySpot) : allSpots),
    [activeList, allSpots, membershipBySpot],
  );

  // Select mode: null = off; otherwise the chosen ids in tap order (the sheet files them in that order).
  const [selected, setSelected] = useState<string[] | null>(null);
  // The ids the open sheet files, fixed when it opens: unticking the active list there takes the spots out of scope
  // (and so out of `selected`), and a re-tick must still put them back. null = sheet closed.
  const [sheetIds, setSheetIds] = useState<string[] | null>(null);
  // The same for the Send sheet: the ids it sends, fixed when it opens.
  const [sendIds, setSendIds] = useState<string[] | null>(null);
  // Selecting is a List view thing: switching to Map, or the last spot in scope going, ends it (adjusting state
  // while rendering, not in an effect).
  if (selected !== null && (viewMode !== 'list' || spots.length === 0)) setSelected(null);
  // Only live spots in scope stay selected: one deleted elsewhere (the tab stays mounted) or outside the list the
  // picker switched to is dropped for good, so switching back doesn't bring it back checked.
  const inScope = useMemo(() => new Set(spots.map((s) => s.id)), [spots]);
  if (selected?.some((id) => !inScope.has(id))) setSelected(selected.filter((id) => inScope.has(id)));
  const selecting = selected !== null;
  const chosen = useMemo(() => selected ?? [], [selected]);
  const selectedIds = useMemo(() => (selected ? new Set(selected) : undefined), [selected]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev?.includes(id) ? prev.filter((x) => x !== id) : [...(prev ?? []), id]));
  const endSelecting = () => {
    setSheetIds(null);
    setSendIds(null);
    setSelected(null);
  };

  const selectAction = selecting ? (
    <HeaderTextButton onPress={endSelecting} accessibilityLabel="Cancel selection">
      Cancel
    </HeaderTextButton>
  ) : viewMode === 'list' && spots.length > 0 ? (
    <HeaderTextButton onPress={() => setSelected([])} accessibilityLabel="Select spots">
      Select
    </HeaderTextButton>
  ) : null;

  const count = chosen.length;
  const addLabel = `Add to list (${count})`;
  const sendLabel = `Send (${count})`;

  return (
    <View style={styles.container}>
      <SpotsBrowser
        spots={spots}
        {...(activeList
          ? activeList.kind === 'area'
            ? EMPTY_AREA_COPY
            : EMPTY_LIST_COPY
          : {
              emptyTitle: 'No Spots Yet',
              emptyMessage: 'Tap the + button to add your first spot, or import from your photos',
              emptyActionLabel: 'Add Spot',
              onEmptyAction: () => router.push('/add/camera'),
            })}
        aboveList={<ListPickerChips />}
        contentBottomInset={selecting ? spacing.md : LIST_BOTTOM_PADDING}
        // Left, so the header's right side stays the Filter button alone.
        headerLeft={selectAction}
        // headerTitle, not title: a tab's title is also its tab bar label.
        headerTitle={selecting ? `${count} selected` : undefined}
        selectedIds={selectedIds}
        onSpotPress={selecting ? toggle : undefined}
        onSpotLongPress={(id) => (selecting ? toggle(id) : setSelected([id]))}
        // Pull to refresh = sync now (D48); signed out there is nothing to sync.
        refreshControl={
          signedIn ? <RefreshControl refreshing={pulling} onRefresh={pullToSync} /> : undefined
        }
      />
      {selecting ? (
        <View testID="select-bar" style={styles.selectBar}>
          {[
            { label: sendLabel, onPress: () => setSendIds(chosen) },
            { label: addLabel, onPress: () => setSheetIds(chosen) },
          ].map(({ label, onPress }) => (
            <Pressable
              key={label}
              onPress={onPress}
              disabled={count === 0}
              style={({ pressed }) => [
                styles.selectButton,
                count === 0 && styles.selectButtonDisabled,
                pressed && styles.selectButtonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ disabled: count === 0 }}>
              <Text style={styles.selectButtonText}>{label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <AddToListSheet visible={sheetIds !== null} spotIds={sheetIds ?? []} onClose={endSelecting} />
      {sendIds ? <SendSheet spotIds={sendIds} onClose={endSelecting} /> : null}
      {/* The floating actions would cover the select bar; nothing to add while choosing spots. */}
      {selecting ? null : (
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  selectBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.gray[200],
    backgroundColor: palette.white,
  },
  selectButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: palette.blue[500],
  },
  selectButtonDisabled: {
    backgroundColor: palette.gray[300],
  },
  selectButtonPressed: {
    opacity: 0.8,
  },
  selectButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.white,
  },
  // Floating actions: the secondary "Import photos" button stacked above the "+" FAB (D12).
  fabColumn: {
    position: 'absolute',
    bottom: FAB_BOTTOM,
    right: 32,
    alignItems: 'center',
    gap: FAB_GAP,
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
