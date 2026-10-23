import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, View, Pressable, Text } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';

import { selectListSpots, useHitListsStore, useSpotsStore } from '@/src/stores';
import { SpotsBrowser } from '@/src/components/SpotsBrowser';
import { AddToListSheet } from '@/src/components/AddToListSheet';
import { ListPickerChips } from '@/src/components/ListPickerChips';
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
  const [sheetVisible, setSheetVisible] = useState(false);
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
    setSheetVisible(false);
    setSelected(null);
  };

  const selectAction = selecting ? (
    <Pressable
      onPress={endSelecting}
      hitSlop={8}
      accessibilityLabel="Cancel selection"
      accessibilityRole="button"
      style={styles.headerAction}>
      <Text style={styles.headerActionText}>Cancel</Text>
    </Pressable>
  ) : viewMode === 'list' && spots.length > 0 ? (
    <Pressable
      onPress={() => setSelected([])}
      hitSlop={8}
      accessibilityLabel="Select spots"
      accessibilityRole="button"
      style={styles.headerAction}>
      <Text style={styles.headerActionText}>Select</Text>
    </Pressable>
  ) : null;

  const count = chosen.length;
  const addLabel = `Add to list (${count})`;

  return (
    <View style={styles.container}>
      <SpotsBrowser
        spots={spots}
        {...(activeList
          ? {
              emptyTitle: 'No spots in this list yet',
              emptyMessage: "Add from a spot's page or select spots on the Spots tab",
            }
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
      />
      {selecting ? (
        <View testID="select-bar" style={styles.selectBar}>
          <Pressable
            onPress={() => setSheetVisible(true)}
            disabled={count === 0}
            style={({ pressed }) => [
              styles.selectButton,
              count === 0 && styles.selectButtonDisabled,
              pressed && styles.selectButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={addLabel}
            accessibilityState={{ disabled: count === 0 }}>
            <Text style={styles.selectButtonText}>{addLabel}</Text>
          </Pressable>
        </View>
      ) : null}
      <AddToListSheet visible={sheetVisible} spotIds={chosen} onClose={endSelecting} />
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
  headerAction: {
    paddingHorizontal: spacing.sm,
  },
  headerActionText: {
    fontSize: 16,
    color: palette.blue[500],
    fontWeight: '500',
  },
  selectBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.gray[200],
    backgroundColor: palette.white,
  },
  selectButton: {
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
