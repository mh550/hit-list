import { useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { EmptyState, NameListSheet } from '@/src/components';
import { palette, spacing } from '@/src/constants/theme';
import { useHitListActions } from '@/src/hooks/use-hit-list-actions';
import { selectListCounts, selectListsByName, useHitListsStore, useSpotsStore } from '@/src/stores';
import type { HitList } from '@/src/types';

const spotCountLabel = (n: number) => (n === 1 ? '1 spot' : `${n} spots`);

export default function ListsScreen() {
  const router = useRouter();
  const lists = useHitListsStore((s) => s.lists);
  const membershipBySpot = useHitListsStore((s) => s.membershipBySpot);
  const spots = useSpotsStore((s) => s.spots);
  const { createList } = useHitListActions();
  const [naming, setNaming] = useState(false);

  const counts = useMemo(() => selectListCounts(lists, spots, membershipBySpot), [lists, spots, membershipBySpot]);
  // S8 adds 'Shared with me'; a section only shows when it has rows.
  const sections = useMemo(() => {
    const mine = selectListsByName(lists.filter((l) => l.deleted_at === undefined));
    return mine.length > 0 ? [{ title: 'My hit lists', data: mine }] : [];
  }, [lists]);

  const handleCreate = async (name: string) => {
    try {
      const list = await createList(name);
      setNaming(false);
      router.push(`/list/${list.id}`);
    } catch (err) {
      // useHitListActions has logged it and taken the list back out of the store.
      Alert.alert("Couldn't create the list", 'Please try again.');
      throw err;
    }
  };

  const renderItem = ({ item }: { item: HitList }) => {
    const count = spotCountLabel(counts[item.id] ?? 0);
    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => router.push(`/list/${item.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${count}`}>
        <View style={styles.rowText}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.rowCount}>{count}</Text>
        </View>
        <IconSymbol name="chevron.right" size={18} color={palette.gray[400]} />
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <Pressable
        style={({ pressed }) => [styles.newButton, pressed && styles.rowPressed]}
        onPress={() => setNaming(true)}
        accessibilityRole="button"
        accessibilityLabel="New hit list">
        <IconSymbol name="plus" size={20} color={palette.blue[500]} />
        <Text style={styles.newText}>New hit list</Text>
      </Pressable>

      {sections.length === 0 ? (
        // No action button: the one above is the action, and two 'New hit list' labels would collide.
        <EmptyState
          icon="list.bullet"
          title="No hit lists yet"
          message="Group spots you mean to hit: by hand, or by area"
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(l) => l.id}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader} accessibilityRole="header">
              {section.title}
            </Text>
          )}
          ItemSeparatorComponent={Separator}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
        />
      )}

      <NameListSheet
        visible={naming}
        title="New hit list"
        confirmLabel="Create"
        onCancel={() => setNaming(false)}
        onSubmit={handleCreate}
      />
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.gray[200],
  },
  newText: {
    fontSize: 17,
    fontWeight: '600',
    color: palette.blue[500],
  },
  listContent: {
    paddingBottom: spacing['3xl'],
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.gray[900],
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowPressed: {
    backgroundColor: palette.gray[100],
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    fontSize: 17,
    fontWeight: '600',
    color: palette.gray[900],
  },
  rowCount: {
    fontSize: 14,
    color: palette.gray[500],
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.gray[200],
    marginLeft: spacing.lg,
  },
});
