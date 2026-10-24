import { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { Chip } from '@/src/components/Chip';
import { SharedBadge, sharedLabel } from '@/src/components/SharedBadge';
import { palette, spacing } from '@/src/constants/theme';
import { selectListsByName, useHitListsStore } from '@/src/stores';

/**
 * The Spots tab's scope row: 'My spots' (every spot) then each live hit list by name, a shared one with its badge.
 * Reads and writes the store's activeListId; with no lists there is nothing to pick, so it renders nothing.
 */
export function ListPickerChips() {
  const lists = useHitListsStore((s) => s.lists);
  const activeListId = useHitListsStore((s) => s.activeListId);
  const setActiveListId = useHitListsStore((s) => s.setActiveListId);
  const live = useMemo(() => selectListsByName(lists.filter((l) => l.deleted_at === undefined)), [lists]);

  if (live.length === 0) return null;

  return (
    <ScrollView
      horizontal
      accessibilityRole="tablist"
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={styles.scroll}
      contentContainerStyle={styles.row}>
      <Chip
        role="tab"
        label="My spots"
        selected={activeListId === null}
        onPress={() => setActiveListId(null)}
      />
      {live.map((list) => {
        const selected = list.id === activeListId;
        const shared = sharedLabel(list);
        return (
          <Chip
            key={list.id}
            role="tab"
            label={list.name}
            selected={selected}
            onPress={() => setActiveListId(list.id)}
            accessibilityLabel={shared ? `${list.name}, ${shared}` : undefined}
            accessory={
              shared ? <SharedBadge list={list} color={selected ? palette.white : palette.gray[500]} /> : undefined
            }
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // A horizontal ScrollView defaults to flexGrow 1 / flexShrink 1 and would take half the screen's height.
  scroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  row: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
});
