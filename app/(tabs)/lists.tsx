import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Button, EmptyState, NameListSheet, SharedBadge, sharedLabel } from '@/src/components';
import { palette, spacing } from '@/src/constants/theme';
import { useHitListActions } from '@/src/hooks/use-hit-list-actions';
import { useRiderId } from '@/src/hooks/use-rider-id';
import {
  selectListCounts,
  selectInvitations,
  selectListsByName,
  selectSharedWithMe,
  useHitListsStore,
  useSpotsStore,
} from '@/src/stores';
import { useAuthStore } from '@/src/stores/auth-store';
import { inviteSpotCount, useInboxStore, type InviteItem } from '@/src/stores/inbox-store';
import { useSettingsStore } from '@/src/stores/settings-store';
import { showToast } from '@/src/stores/toast-store';
import { getSupabase } from '@/src/sync/client';
import { joinList } from '@/src/sync/join';
import { INVITATION_WITHDRAWN } from '@/src/sync/lists';
import type { HitList } from '@/src/types';
import { areaLabel, isAreaList } from '@/src/utils/area';
import { handleOf } from '@/src/utils/members';
import { isForeign } from '@/src/utils/ownership';
import { spotCountLabel } from '@/src/utils/spot-name';

/** A row: a list, or an invitation to one (S8-06), which holds no spots until Join (D83). */
type Row = { type: 'list'; list: HitList } | { type: 'invite'; invite: InviteItem };

const rowKey = (row: Row) => (row.type === 'list' ? row.list.id : `invite:${row.invite.listId}`);

export default function ListsScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const lists = useHitListsStore((s) => s.lists);
  const membershipBySpot = useHitListsStore((s) => s.membershipBySpot);
  const spots = useSpotsStore((s) => s.spots);
  const units = useSettingsStore((s) => s.units);
  const uid = useRiderId();
  const authStatus = useAuthStore((s) => s.status);
  const authUserId = useAuthStore((s) => s.userId);
  const inboxUserId = useInboxStore((s) => s.userId);
  const inboxItems = useInboxStore((s) => s.items);
  const client = getSupabase();
  /** The invitations with a Join running; the ref answers a second tap before the spinner renders. */
  const [joining, setJoining] = useState<ReadonlySet<string>>(new Set());
  const joiningIds = useRef(new Set<string>());
  const { createList } = useHitListActions();
  const [naming, setNaming] = useState(false);

  const counts = useMemo(() => selectListCounts(lists, spots, membershipBySpot), [lists, spots, membershipBySpot]);
  // Only the signed-in rider's invitations, while a client can answer them.
  const signedInAs = client && authStatus === 'signed_in' ? authUserId : null;
  const invitations = useMemo(
    () => (signedInAs && inboxUserId === signedInAs ? selectInvitations(inboxItems) : []),
    [signedInAs, inboxUserId, inboxItems],
  );
  // Mine (owned or phone-only), then the invitations and others' lists the rider joined (S8); a section only shows
  // when it has rows.
  const sections = useMemo(() => {
    const live = lists.filter((l) => l.deleted_at === undefined);
    const asRows = (ls: HitList[]): Row[] => ls.map((list) => ({ type: 'list', list }));
    const mine = selectListsByName(live.filter((l) => !isForeign(l, uid)));
    const theirs = uid ? selectSharedWithMe(live, uid) : [];
    return [
      { title: 'My hit lists', data: asRows(mine) },
      {
        title: 'Shared with me',
        data: [...invitations.map((invite): Row => ({ type: 'invite', invite })), ...asRows(theirs)],
      },
    ].filter((section) => section.data.length > 0);
  }, [lists, uid, invitations]);

  /** Join, as the Inbox's: the row leaves once the server answered; the list shows once the sync brought it. */
  const handleJoin = async (invite: InviteItem) => {
    if (!client || !signedInAs || joiningIds.current.has(invite.listId)) return;
    joiningIds.current.add(invite.listId);
    setJoining(new Set(joiningIds.current));
    const result = await joinList(db, client, signedInAs, invite.listId);
    joiningIds.current.delete(invite.listId);
    setJoining(new Set(joiningIds.current));
    if (result === 'failed') Alert.alert("Couldn't reach the server", 'Try again.');
    else showToast(result === 'joined' ? `Joined ${invite.listName}` : INVITATION_WITHDRAWN);
  };

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

  const renderInvite = (invite: InviteItem) => {
    const subtitle = `${handleOf(invite.from.username, 'A friend')} invited you · ${inviteSpotCount(invite)}`;
    return (
      <View style={styles.row}>
        <View style={styles.rowText} accessible accessibilityLabel={`${invite.listName}, ${subtitle}`}>
          <Text style={styles.rowName} numberOfLines={1}>
            {invite.listName}
          </Text>
          <Text style={styles.rowCount}>{subtitle}</Text>
        </View>
        {joining.has(invite.listId) ? (
          <ActivityIndicator color={palette.gray[500]} accessibilityLabel="Joining" />
        ) : (
          <Button
            title="Join"
            size="sm"
            accessibilityLabel={`Join ${invite.listName}`}
            onPress={() => void handleJoin(invite)}
          />
        )}
      </View>
    );
  };

  const renderItem = ({ item: row }: { item: Row }) => {
    if (row.type === 'invite') return renderInvite(row.invite);
    const item = row.list;
    const spotCount = spotCountLabel(counts[item.id] ?? 0);
    // Another rider's list names its owner: '@ana · 12 spots'.
    const count = isForeign(item, uid) ? `${handleOf(item.owner_username, 'A friend')} · ${spotCount}` : spotCount;
    // No place on the row: rows are tight (the list's own header has it).
    const area = isAreaList(item) ? areaLabel(item.area_radius_m, units) : null;
    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => router.push(`/list/${item.id}`)}
        accessibilityRole="button"
        accessibilityLabel={[item.name, area, count, sharedLabel(item)].filter(Boolean).join(', ')}>
        <View style={styles.rowText}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.name}
          </Text>
          {area ? <Text style={styles.rowCount}>{area}</Text> : null}
          <Text style={styles.rowCount}>{count}</Text>
        </View>
        <SharedBadge list={item} />
        <IconSymbol name="chevron.right" size={18} color={palette.gray[400]} />
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.newRow}>
        <Pressable
          style={({ pressed }) => [styles.newButton, pressed && styles.rowPressed]}
          onPress={() => setNaming(true)}
          accessibilityRole="button"
          accessibilityLabel="New hit list">
          <IconSymbol name="plus" size={20} color={palette.blue[500]} />
          <Text style={styles.newText}>New hit list</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.newButton, pressed && styles.rowPressed]}
          onPress={() => router.push('/area')}
          accessibilityRole="button"
          accessibilityLabel="New area list">
          <IconSymbol name="plus" size={20} color={palette.blue[500]} />
          <Text style={styles.newText}>Area list</Text>
        </Pressable>
      </View>

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
          keyExtractor={rowKey}
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
  newRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.gray[200],
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
