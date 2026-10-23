import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  Button,
  EmptyState,
  HeaderTextButton,
  NameListSheet,
  SendSheet,
  ShareListSheet,
  SpotsBrowser,
} from '@/src/components';
import { EMPTY_AREA_COPY, EMPTY_LIST_COPY } from '@/src/components/SpotsBrowser';
import { palette, spacing } from '@/src/constants/theme';
import { useHitListActions } from '@/src/hooks/use-hit-list-actions';
import { selectListSpots, selectMySpots, useHitListsStore, useSpotsStore } from '@/src/stores';
import { useRiderId } from '@/src/hooks/use-rider-id';
import { useAuthStore } from '@/src/stores/auth-store';
import { useSettingsStore } from '@/src/stores/settings-store';
import type { HitList } from '@/src/types';
import { areaLabel, isAreaList } from '@/src/utils/area';
import { initialOf, joinedMembers, memberCount, myRole } from '@/src/utils/members';
import { isForeign } from '@/src/utils/ownership';
import { getSpotDisplayName, spotCountLabel } from '@/src/utils/spot-name';

/** Circles the member strip shows before '+2'. */
const STRIP_CIRCLES = 5;
const SHARE_SUBTITLE = "live: they'll see new spots too";

/**
 * A shared list's members under its title (S8-04): initials circles for the owner then each joined member, the count
 * (D84: invitations don't count) and, for the owner, '+ Invite'. Pressing the circles opens the members screen.
 */
function MemberStrip({
  list,
  uid,
  username,
  onOpen,
  onInvite,
}: {
  list: HitList;
  uid: string | null;
  /** The rider's own name: the profiles mirror holds others' only. */
  username: string | null;
  onOpen: () => void;
  onInvite?: () => void;
}) {
  const nameOf = (id: string | undefined, mirrored: string | undefined) => (id === uid && username ? username : mirrored);
  const names = [
    nameOf(list.owner_id, list.owner_username),
    ...joinedMembers(list).map((m) => nameOf(m.user_id, m.username)),
  ];
  const shown = names.slice(0, STRIP_CIRCLES);
  const more = names.length - shown.length;
  const count = memberCount(list);
  return (
    <View style={styles.strip}>
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => [styles.stripMembers, pressed && styles.actionPressed]}
        accessibilityRole="button"
        accessibilityLabel={`${count} in this list. Show members`}>
        {shown.map((name, i) => (
          <View key={i} style={[styles.circle, i > 0 && styles.circleOverlap]}>
            <Text style={styles.circleText}>{initialOf(name)}</Text>
          </View>
        ))}
        {more > 0 ? <Text style={styles.stripMore}>{`+${more}`}</Text> : null}
        <IconSymbol name="person.2.fill" size={16} color={palette.gray[500]} />
        <Text style={styles.stripCount}>{String(count)}</Text>
      </Pressable>
      {onInvite ? (
        <Pressable onPress={onInvite} hitSlop={8} accessibilityRole="button" accessibilityLabel="+ Invite">
          <Text style={styles.stripInvite}>+ Invite</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * One hit list: the Spots tab's List | Map body scoped to the list's spots, plus Rename and Delete list. An area list's
 * spots are computed from its circle, so it has 'Edit area' in place of 'Remove from list'. The owner shares it
 * ('Share list', live) beside 'Send these spots' (a one-time copy); a shared list shows its members under the title,
 * and a member gets none of the owner's controls (S8-04, D42).
 */
export default function ListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const list = useHitListsStore((s) => s.lists.find((l) => l.id === id && l.deleted_at === undefined));
  const membershipBySpot = useHitListsStore((s) => s.membershipBySpot);
  const spots = useSpotsStore((s) => s.spots);
  const uid = useRiderId();
  const username = useAuthStore((s) => s.username);
  const units = useSettingsStore((s) => s.units);
  const { renameList, deleteList, removeSpotFromList } = useHitListActions();
  const [renaming, setRenaming] = useState(false);
  // Set once Delete is confirmed: the store drops the list before router.back() runs, so 'gone' would flash.
  const [deleting, setDeleting] = useState(false);
  // The ids the open Send sheet sends, fixed when it opens; null = closed.
  const [sendIds, setSendIds] = useState<string[] | null>(null);
  // The open Share sheet's mode; null = closed.
  const [shareMode, setShareMode] = useState<'share' | 'invite' | null>(null);

  const listSpots = useMemo(
    () => (list ? selectListSpots(list, spots, membershipBySpot) : []),
    [list, spots, membershipBySpot],
  );
  const ownSpots = useMemo(() => selectMySpots(listSpots, uid), [listSpots, uid]);

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

  const owner = !isForeign(list, uid);
  // A member with 'add' takes out only what they put in; a view-only member nothing (D42). The owner any spot.
  const role = myRole(list, uid);

  const handleSpotLongPress = (spotId: string) => {
    const spot = listSpots.find((s) => s.id === spotId);
    if (!spot) return;
    if (role !== 'owner' && (role !== 'add' || isForeign(spot, uid))) return;
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
    const consequence = list.shared ? ` Members lose access to all ${spotCountLabel(listSpots.length)} now.` : '';
    Alert.alert(`Delete ${list.name}?`, `Spots stay in your library.${consequence}`, [
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
  const area = isAreaList(list) ? areaLabel(list.area_radius_m, units, list.area_place) : undefined;
  const areaTitle = area ? (
    <View style={styles.title} accessible accessibilityRole="header" accessibilityLabel={`${list.name}, ${area}`}>
      <Text style={styles.titleName} numberOfLines={1}>
        {list.name}
      </Text>
      <Text style={styles.titleArea} numberOfLines={1}>
        {area}
      </Text>
    </View>
  ) : undefined;

  // Every spot of the list (an area list's are the ones inside its circle), not just the ones a search shows; in a
  // shared list only the rider's own: another rider's spot is never sent onward (S8, D87).
  const subtitle = `one-time copy of ${spotCountLabel(ownSpots.length)}`;
  // The owner's live action: 'Share list' on a private list, 'Invite' once it is shared (the sheet's invite mode).
  const shareTitle = list.shared ? 'Invite' : 'Share list';
  const sendAction =
    ownSpots.length > 0 ? (
      <Pressable
        onPress={() => setSendIds(ownSpots.map((s) => s.id))}
        style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
        accessibilityRole="button"
        accessibilityLabel={`Send these spots, ${subtitle}`}>
        <IconSymbol name="paperplane.fill" size={20} color={palette.blue[500]} />
        <View style={styles.actionLabel}>
          <Text style={styles.actionTitle}>Send these spots</Text>
          <Text style={styles.actionSubtitle}>{subtitle}</Text>
        </View>
      </Pressable>
    ) : null;
  const shareAction = owner ? (
    <Pressable
      onPress={() => setShareMode(list.shared ? 'invite' : 'share')}
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${shareTitle}, ${SHARE_SUBTITLE}`}>
      <IconSymbol name="person.2.fill" size={20} color={palette.blue[500]} />
      <View style={styles.actionLabel}>
        <Text style={styles.actionTitle}>{shareTitle}</Text>
        <Text style={styles.actionSubtitle}>{SHARE_SUBTITLE}</Text>
      </View>
    </Pressable>
  ) : null;
  const strip = list.shared ? (
    <MemberStrip
      list={list}
      uid={uid}
      username={username}
      onOpen={() => router.push(`/list/${list.id}/members`)}
      onInvite={owner ? () => setShareMode('invite') : undefined}
    />
  ) : null;
  const aboveList =
    strip || sendAction || shareAction ? (
      <View>
        {strip}
        {sendAction || shareAction ? (
          <View style={styles.actions}>
            {sendAction}
            {shareAction}
          </View>
        ) : null}
      </View>
    ) : undefined;

  const renameButton = owner ? (
    <HeaderTextButton onPress={() => setRenaming(true)} accessibilityLabel="Rename list">
      Rename
    </HeaderTextButton>
  ) : undefined;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: list.name }} />
      <SpotsBrowser
        spots={listSpots}
        {...(isArea ? EMPTY_AREA_COPY : EMPTY_LIST_COPY)}
        headerTitle={areaTitle}
        headerActions={renameButton}
        aboveList={aboveList}
        onSpotLongPress={isArea ? undefined : handleSpotLongPress}
      />
      {owner ? (
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
      ) : null}
      <NameListSheet
        visible={renaming}
        title="Rename list"
        initialName={list.name}
        confirmLabel="Save"
        onCancel={() => setRenaming(false)}
        onSubmit={handleRename}
      />
      {sendIds ? <SendSheet spotIds={sendIds} onClose={() => setSendIds(null)} /> : null}
      {shareMode ? <ShareListSheet listId={list.id} mode={shareMode} onClose={() => setShareMode(null)} /> : null}
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
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.lg,
    rowGap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  stripMembers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.gray[100],
    borderWidth: 2,
    borderColor: palette.white,
  },
  circleOverlap: {
    marginLeft: -(spacing.xs + 8),
  },
  circleText: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.gray[700],
  },
  stripMore: {
    fontSize: 13,
    color: palette.gray[500],
  },
  stripCount: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.gray[700],
  },
  stripInvite: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.blue[500],
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  actionPressed: {
    opacity: 0.6,
  },
  actionLabel: {
    gap: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.blue[500],
  },
  actionSubtitle: {
    fontSize: 13,
    color: palette.gray[500],
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
