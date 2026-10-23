import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useHitListActions } from '@/src/hooks/use-hit-list-actions';
import { selectListsByName, useHitListsStore } from '@/src/stores';
import { palette, radius, spacing } from '@/src/constants/theme';
import { NameListSheet } from './NameListSheet';

interface Props {
  visible: boolean;
  /** The spots to file: one from a spot's page, the selection from the Spots tab. */
  spotIds: string[];
  onClose: () => void;
}

/**
 * A set of switches, one per manual list: each toggle writes at once (no staging) and Done only closes. A list is
 * checked when every given spot is in it, so toggling an unchecked one adds them all.
 */
export function AddToListSheet({ visible, ...rest }: Props) {
  if (!visible) return null;
  return <AddToListSheetContent {...rest} />;
}

function AddToListSheetContent({ spotIds, onClose }: Omit<Props, 'visible'>) {
  const lists = useHitListsStore((s) => s.lists);
  const membershipBySpot = useHitListsStore((s) => s.membershipBySpot);
  const { createList, addSpotsToList, removeSpotFromList } = useHitListActions();
  const [naming, setNaming] = useState(false);

  const rows = useMemo(
    () => selectListsByName(lists.filter((l) => l.kind === 'manual' && l.deleted_at === undefined)),
    [lists],
  );
  // No spots is in no list (every() over [] would check them all).
  const holdsAll = (listId: string) =>
    spotIds.length > 0 && spotIds.every((id) => membershipBySpot[id]?.includes(listId));

  // The hook has already put the store back when a write fails; this only says so, once per toggle.
  const reportFailure = (write: Promise<unknown>) =>
    write.catch(() => Alert.alert("Couldn't update the list", 'Please try again.'));
  const add = (listId: string) => reportFailure(addSpotsToList(listId, spotIds));

  const toggle = (listId: string) =>
    holdsAll(listId)
      ? reportFailure(Promise.all(spotIds.map((id) => removeSpotFromList(listId, id))))
      : add(listId);

  const create = async (name: string) => {
    let listId: string;
    try {
      listId = (await createList(name)).id;
    } catch (err) {
      Alert.alert("Couldn't create the list", 'Please try again.');
      throw err;
    }
    setNaming(false);
    await add(listId);
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Add to hit list
          </Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {rows.map((list) => {
            const checked = holdsAll(list.id);
            return (
              <Pressable
                key={list.id}
                onPress={() => toggle(list.id)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                accessibilityRole="checkbox"
                accessibilityLabel={list.name}
                accessibilityState={{ checked }}>
                <Text style={styles.rowText} numberOfLines={1}>
                  {list.name}
                </Text>
                <View style={[styles.box, checked && styles.boxChecked]}>
                  {checked ? <IconSymbol name="checkmark" size={16} color={palette.white} /> : null}
                </View>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setNaming(true)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            accessibilityRole="button"
            accessibilityLabel="New hit list">
            <Text style={styles.newText}>+ New hit list</Text>
          </Pressable>
        </ScrollView>

        {/* Inside this Modal's tree so iOS presents it on top of the sheet. */}
        <NameListSheet
          visible={naming}
          title="New hit list"
          confirmLabel="Create"
          onCancel={() => setNaming(false)}
          onSubmit={create}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.white,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.gray[200],
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.gray[900],
  },
  done: {
    fontSize: 17,
    color: palette.blue[500],
    fontWeight: '600',
  },
  content: {
    paddingBottom: spacing['3xl'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.gray[200],
  },
  rowPressed: {
    backgroundColor: palette.gray[100],
  },
  rowText: {
    flexShrink: 1,
    fontSize: 17,
    color: palette.gray[900],
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    borderWidth: 2,
    borderColor: palette.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: {
    backgroundColor: palette.blue[500],
    borderColor: palette.blue[500],
  },
  newText: {
    fontSize: 17,
    color: palette.blue[500],
    fontWeight: '500',
  },
});
