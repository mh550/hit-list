import { useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { confirmedListKey, getSyncState, setSyncState } from '@/src/db/sync';
import { useHitListActions } from '@/src/hooks/use-hit-list-actions';
import { useRiderId } from '@/src/hooks/use-rider-id';
import { selectListSpots, selectListsByName, useHitListsStore, useSpotsStore } from '@/src/stores';
import type { HitList } from '@/src/types';
import { palette, radius, spacing } from '@/src/constants/theme';
import { memberCount } from '@/src/utils/members';
import { isForeign } from '@/src/utils/ownership';
import { NameListSheet } from './NameListSheet';
import { SharedBadge, sharedLabel } from './SharedBadge';

interface Props {
  visible: boolean;
  /** The spots to file: one from a spot's page, the selection from the Spots tab. */
  spotIds: string[];
  onClose: () => void;
}

/**
 * A set of switches, one per list: each toggle writes at once (no staging) and Done only closes. A list is checked
 * when every given spot is in it, so toggling an unchecked one adds them all. An area list's row is read-only: its
 * spots are the ones inside its circle, so it shows whether they are and never writes. So is another rider's list
 * unless the rider joined it with 'Can add spots' (D42). The first add to a shared list on this phone asks first,
 * once per list (D90).
 */
export function AddToListSheet({ visible, ...rest }: Props) {
  if (!visible) return null;
  return <AddToListSheetContent {...rest} />;
}

function AddToListSheetContent({ spotIds, onClose }: Omit<Props, 'visible'>) {
  const lists = useHitListsStore((s) => s.lists);
  const membershipBySpot = useHitListsStore((s) => s.membershipBySpot);
  const spots = useSpotsStore((s) => s.spots);
  const db = useSQLiteContext();
  const uid = useRiderId();
  const { createList, addSpotsToList, removeSpotFromList } = useHitListActions();
  const [naming, setNaming] = useState(false);
  // The shared lists whose first-add question is being read or shown: a second tap asks nothing more.
  const asking = useRef(new Set<string>());

  const rows = useMemo(() => selectListsByName(lists.filter((l) => l.deleted_at === undefined)), [lists]);
  const given = useMemo(() => {
    const ids = new Set(spotIds);
    return spots.filter((s) => ids.has(s.id));
  }, [spots, spotIds]);
  // No spots is in no list (every() over [] would check them all).
  const holdsAll = (list: HitList) =>
    list.kind === 'area'
      ? given.length > 0 && selectListSpots(list, given, membershipBySpot).length === given.length
      : spotIds.length > 0 && spotIds.every((id) => membershipBySpot[id]?.includes(list.id));

  // The hook has already put the store back when a write fails; this only says so, once per toggle.
  const reportFailure = (write: Promise<unknown>) =>
    write.catch(() => Alert.alert("Couldn't update the list", 'Please try again.'));
  const add = (listId: string) => reportFailure(addSpotsToList(listId, spotIds));

  // The answer is kept only once the add went through: a failed add asks again next time.
  const addConfirmed = async (list: HitList) => {
    try {
      await addSpotsToList(list.id, spotIds);
    } catch {
      Alert.alert("Couldn't update the list", 'Please try again.');
      return;
    }
    await setSyncState(db, confirmedListKey(list.id), '1').catch((err: unknown) =>
      console.warn('[AddToListSheet] first-add answer not saved:', err),
    );
  };

  // Everyone in a shared list sees what lands in it (§1): the first add on this phone says so.
  const addToShared = async (list: HitList) => {
    if (asking.current.has(list.id)) return;
    asking.current.add(list.id);
    const confirmed = await getSyncState(db, confirmedListKey(list.id)).catch(() => undefined);
    if (confirmed) {
      asking.current.delete(list.id);
      await add(list.id);
      return;
    }
    const what = spotIds.length === 1 ? 'this spot' : `these ${spotIds.length} spots`;
    const release = () => void asking.current.delete(list.id);
    Alert.alert(
      `Everyone in ${list.name} (${memberCount(list)}) will see ${what}.`,
      undefined,
      [
        { text: 'Cancel', style: 'cancel', onPress: release },
        {
          text: 'Add',
          onPress: () => {
            release();
            return addConfirmed(list);
          },
        },
      ],
      { onDismiss: release },
    );
  };

  const toggle = (list: HitList) => {
    if (holdsAll(list)) return reportFailure(Promise.all(spotIds.map((id) => removeSpotFromList(list.id, id))));
    return list.shared ? addToShared(list) : add(list.id);
  };

  /** Why a row can't be toggled: an area list's spots are its circle's; another rider's list is theirs unless the
   * rider joined it with 'Can add spots'. */
  const hintOf = (list: HitList) => {
    if (list.kind === 'area') return AREA_HINT;
    if (!isForeign(list, uid)) return undefined;
    const mine = list.members?.find((m) => m.user_id === uid && m.status === 'member');
    return mine?.role === 'add' ? undefined : VIEW_ONLY_HINT;
  };

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
            const checked = holdsAll(list);
            const hint = hintOf(list);
            const shared = sharedLabel(list);
            const label = shared ? `${list.name}, ${shared}` : list.name;
            if (hint) {
              return (
                <View
                  key={list.id}
                  style={[styles.row, styles.rowDisabled]}
                  accessible
                  accessibilityRole="checkbox"
                  accessibilityLabel={label}
                  accessibilityHint={hint}
                  accessibilityState={{ disabled: true, checked }}>
                  <View style={styles.rowLabel}>
                    <Text style={styles.rowText} numberOfLines={1}>
                      {list.name}
                    </Text>
                    <Text style={styles.rowHint}>{hint}</Text>
                  </View>
                  <SharedBadge list={list} />
                  <View style={[styles.box, checked && styles.boxChecked]}>
                    {checked ? <IconSymbol name="checkmark" size={16} color={palette.white} /> : null}
                  </View>
                </View>
              );
            }
            return (
              <Pressable
                key={list.id}
                onPress={() => toggle(list)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                accessibilityRole="checkbox"
                accessibilityLabel={label}
                accessibilityState={{ checked }}>
                <Text style={[styles.rowText, styles.rowGrow]} numberOfLines={1}>
                  {list.name}
                </Text>
                <SharedBadge list={list} />
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

const AREA_HINT = 'Area list: spots inside its circle are in it automatically';
const VIEW_ONLY_HINT = 'View only';

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
  rowDisabled: {
    opacity: 0.5,
  },
  rowLabel: {
    flex: 1,
    gap: 2,
  },
  // In the row itself the name takes the width, so the badge sits beside the box.
  rowGrow: {
    flex: 1,
  },
  rowHint: {
    fontSize: 13,
    color: palette.gray[500],
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
