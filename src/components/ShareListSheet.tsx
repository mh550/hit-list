import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { SupabaseClient } from '@supabase/supabase-js';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { ROLE_LABELS } from '@/src/constants/labels';
import { palette, radius, spacing, typography } from '@/src/constants/theme';
import { selectListSpots, useHitListsStore, useSpotsStore } from '@/src/stores';
import { useAuthStore } from '@/src/stores/auth-store';
import { useFriendsStore } from '@/src/stores/friends-store';
import { showToast } from '@/src/stores/toast-store';
import { getSupabase } from '@/src/sync/client';
import { syncNow } from '@/src/sync/engine';
import { errorMessage } from '@/src/sync/errors';
import { refreshFriends, type FriendProfile } from '@/src/sync/friends';
import { invite, ListNotBackedUpError, NotAllowedError, shareList } from '@/src/sync/lists';
import type { HitList, MemberRole } from '@/src/types';
import { handleOf } from '@/src/utils/members';
import { ACCOUNTS_NOT_SET_UP } from './AuthScreen';
import { Button } from './Button';
import { SegmentedControl } from './SegmentedControl';

/*
 * Share a hit list (S8-04, docs/plans/2026-10-22-s8-shared-lists.md "Share screens"): live access for the friends the
 * owner checks, all with one role (D88). The word is always Share / Invite, and the sentence under the friends says
 * what it is (D34). Mounted per open, so every open starts with nobody checked. Invite mode is the same sheet for a
 * list already shared: friends already in it can't be checked again.
 */

const NOT_BACKED_UP = "This list isn't backed up yet. Try again when you're online.";
const FAILED = "Couldn't share. Try again.";
const LOAD_FAILED = "Couldn't load your friends.";
const AREA_LINE = "They'll see your spots inside this area, now and later";

const ROLES = (['add', 'view'] as const).map((value) => ({ value, label: ROLE_LABELS[value] }));

const friendHandle = (p: FriendProfile) => handleOf(p.username);

/** D34, verbatim. */
const liveSentence = (name: string) =>
  `Everyone here sees every spot in ${name} — including spots added later — until you remove them or stop sharing.`;

/** '12 spots will become visible to them' · 'One spot …' · none for an empty list. */
function countLine(n: number): string | null {
  if (n === 0) return null;
  return n === 1 ? 'One spot will become visible to them' : `${n} spots will become visible to them`;
}

/** 'Shared Downtown with @ana' · '… with 2 friends' · 'Invited @ana' · 'Invited 2 friends'. */
function doneToast(mode: Mode, listName: string, friends: FriendProfile[]): string {
  const who = friends.length === 1 ? friendHandle(friends[0]) : `${friends.length} friends`;
  return mode === 'share' ? `Shared ${listName} with ${who}` : `Invited ${who}`;
}

type Mode = 'share' | 'invite';
type Phase = null | 'backing_up' | 'sharing';

interface Props {
  listId: string;
  mode: Mode;
  onClose: () => void;
}

export function ShareListSheet({ listId, mode, onClose }: Props) {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const userId = useAuthStore((s) => s.userId);
  const list = useHitListsStore((s) => s.lists.find((l) => l.id === listId && l.deleted_at === undefined));
  const client = getSupabase();
  // The backup before sharing may take a while: Cancel works then and nothing is shared. Once the server call runs
  // the sheet can't be closed, so its finish never closes what opened next.
  const [phase, setPhase] = useState<Phase>(null);
  const cancelledRef = useRef(false);
  const sharing = phase === 'sharing';
  const close = () => {
    if (sharing) return;
    if (phase === 'backing_up') cancelledRef.current = true;
    onClose();
  };
  const name = list?.name ?? 'hit list';
  const title = mode === 'share' ? `Share ${name}` : `Invite to ${name}`;

  let body: ReactNode;
  if (!client || status === 'unconfigured') {
    body = <Text style={styles.centeredText}>{ACCOUNTS_NOT_SET_UP}</Text>;
  } else if (status !== 'signed_in' || !userId) {
    body = (
      <View style={styles.centered}>
        <Text style={styles.centeredText}>Sign in to share hit lists</Text>
        <Button
          title="Sign in"
          onPress={() => {
            onClose();
            router.push('/auth/sign-in');
          }}
        />
      </View>
    );
  } else if (!list) {
    body = <Text style={styles.centeredText}>This list is gone</Text>;
  } else {
    // A new account starts fresh: nobody checked, no line from the one before.
    body = (
      <ShareBody
        key={userId}
        client={client}
        uid={userId}
        list={list}
        mode={mode}
        onClose={onClose}
        phase={phase}
        setPhase={setPhase}
        cancelledRef={cancelledRef}
      />
    );
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
            {title}
          </Text>
          <Pressable
            onPress={close}
            disabled={sharing}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            accessibilityState={{ disabled: sharing }}>
            <Text style={[styles.cancel, sharing && styles.cancelDisabled]}>Cancel</Text>
          </Pressable>
        </View>
        {body}
      </View>
    </Modal>
  );
}

function ShareBody({
  client,
  uid,
  list,
  mode,
  onClose,
  phase,
  setPhase,
  cancelledRef,
}: Omit<Props, 'listId'> & {
  client: SupabaseClient;
  uid: string;
  list: HitList;
  phase: Phase;
  setPhase: (phase: Phase) => void;
  cancelledRef: { current: boolean };
}) {
  const db = useSQLiteContext();
  const router = useRouter();
  const friendsUid = useFriendsStore((s) => s.userId);
  const friendRows = useFriendsStore((s) => s.friends);
  const loadError = useFriendsStore((s) => s.loadError);
  const spots = useSpotsStore((s) => s.spots);
  const membershipBySpot = useHitListsStore((s) => s.membershipBySpot);
  const [checked, setChecked] = useState<string[]>([]);
  const [role, setRole] = useState<MemberRole>('add');
  const [line, setShownLine] = useState<string | null>(null);
  // A live region is Android only: VoiceOver hears a line when it is set.
  const setLine = (text: string | null) => {
    setShownLine(text);
    if (text) AccessibilityInfo.announceForAccessibility(text);
  };
  // Checked synchronously: a second tap before the re-render must not share twice.
  const busy = useRef(false);

  const loaded = friendsUid === uid;
  // The friends load with every sync; a sheet opened before the first one asks for it.
  useEffect(() => {
    if (!loaded) void refreshFriends(db, client, uid);
  }, [loaded, db, client, uid]);

  const friends = useMemo(() => friendRows.map((f) => f.profile), [friendRows]);
  /** Friends already in the list: 'In the list' (joined) or 'Invited'; they aren't invited again. */
  const inList = useMemo(() => new Map((list.members ?? []).map((m) => [m.user_id, m.status])), [list.members]);
  // A friend a sync removed (or the rider blocked) since they were checked is no longer invited.
  const inviteeIds = useMemo(
    () => checked.filter((id) => friends.some((f) => f.id === id) && !inList.has(id)),
    [checked, friends, inList],
  );
  const spotCount = useMemo(
    () => selectListSpots(list, spots, membershipBySpot).length,
    [list, spots, membershipBySpot],
  );

  const toggle = (id: string) =>
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const share = async () => {
    if (busy.current || inviteeIds.length === 0) return;
    busy.current = true;
    cancelledRef.current = false;
    setPhase('backing_up');
    setLine(null);
    const invitees = friends.filter((f) => inviteeIds.includes(f.id));
    try {
      // Back up first, so a list made a moment ago can share (D85).
      await syncNow(db);
      if (cancelledRef.current) return;
      setPhase('sharing');
      const call = mode === 'share' ? shareList : invite;
      const done = await call(db, client, uid, list.id, inviteeIds, role);
      if (done) {
        showToast(doneToast(mode, list.name, invitees));
        onClose();
        return;
      }
      // The session ended (or the phone isn't the rider's yet): nothing was called.
      setLine(FAILED);
    } catch (err) {
      if (err instanceof ListNotBackedUpError) {
        setLine(NOT_BACKED_UP);
      } else if (err instanceof NotAllowedError) {
        setLine(err.message);
      } else {
        console.warn('[share sheet] sharing failed:', errorMessage(err));
        setLine(FAILED);
      }
    } finally {
      busy.current = false;
      setPhase(null);
    }
  };

  let rows: ReactNode;
  if (!loaded) {
    rows = loadError ? (
      <View style={styles.noFriends}>
        <Text style={styles.lineError}>{LOAD_FAILED}</Text>
        <Pressable onPress={() => void refreshFriends(db, client, uid)} hitSlop={8} accessibilityRole="button">
          <Text style={styles.link}>Try again</Text>
        </Pressable>
      </View>
    ) : (
      <ActivityIndicator style={styles.spinner} color={palette.blue[500]} />
    );
  } else if (friends.length === 0) {
    rows = (
      <View style={styles.noFriends}>
        <Text style={styles.noFriendsText}>Add a friend first</Text>
        <Pressable
          onPress={() => {
            onClose();
            router.push('/friends');
          }}
          hitSlop={8}
          accessibilityRole="link">
          <Text style={styles.link}>Find friends</Text>
        </Pressable>
      </View>
    );
  } else {
    rows = friends.map((friend) => {
      const handle = friendHandle(friend);
      const label = friend.display_name ? (
        <Text style={styles.rowHint} numberOfLines={1}>
          {friend.display_name}
        </Text>
      ) : null;
      const already = inList.get(friend.id);
      if (already) {
        const tag = already === 'member' ? 'In the list' : 'Invited';
        return (
          <View key={friend.id} style={styles.row} accessible accessibilityLabel={`${handle}, ${tag}`}>
            <View style={styles.rowLabel}>
              <Text style={styles.rowText} numberOfLines={1}>
                {handle}
              </Text>
              {label}
            </View>
            <Text style={styles.rowTag}>{tag}</Text>
          </View>
        );
      }
      const on = checked.includes(friend.id);
      return (
        <Pressable
          key={friend.id}
          onPress={() => toggle(friend.id)}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          accessibilityRole="checkbox"
          accessibilityLabel={handle}
          accessibilityState={{ checked: on }}>
          <View style={styles.rowLabel}>
            <Text style={styles.rowText} numberOfLines={1}>
              {handle}
            </Text>
            {label}
          </View>
          <View style={[styles.box, on && styles.boxChecked]}>
            {on ? <IconSymbol name="checkmark" size={16} color={palette.white} /> : null}
          </View>
        </Pressable>
      );
    });
  }

  const count = mode === 'share' ? countLine(spotCount) : null;
  const canShare = inviteeIds.length > 0 && phase === null;
  const action = mode === 'share' ? 'Share' : 'Invite';
  const actionLabel = phase === null ? action : mode === 'share' ? 'Sharing…' : 'Inviting…';
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.sectionHeader}>Friends</Text>
      {rows}

      {loaded && friends.length > 0 ? (
        <View style={styles.roles}>
          <SegmentedControl segments={ROLES} selectedValue={role} onValueChange={setRole} />
        </View>
      ) : null}

      <Text style={styles.sentence}>{liveSentence(list.name)}</Text>
      {count ? <Text style={styles.sentence}>{count}</Text> : null}
      {list.kind === 'area' ? <Text style={styles.sentence}>{AREA_LINE}</Text> : null}
      {line ? (
        <Text style={styles.lineError} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {line}
        </Text>
      ) : null}
      {loaded && friends.length > 0 ? (
        <Pressable
          onPress={share}
          disabled={!canShare}
          style={({ pressed }) => [styles.primary, styles.action, !canShare && styles.primaryDisabled, pressed && styles.primaryPressed]}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityState={{ disabled: !canShare, busy: phase !== null }}>
          <IconSymbol name="person.2.fill" size={18} color={palette.white} />
          <Text style={styles.primaryText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
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
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.gray[200],
  },
  title: {
    flexShrink: 1,
    fontSize: 20,
    fontWeight: '700',
    color: palette.gray[900],
  },
  cancel: {
    fontSize: 17,
    color: palette.blue[500],
  },
  cancelDisabled: {
    color: palette.gray[300],
  },
  centered: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  centeredText: {
    ...typography.body,
    color: palette.gray[700],
    textAlign: 'center',
    padding: spacing.xl,
  },
  content: {
    paddingTop: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  sectionHeader: {
    ...typography.headline,
    color: palette.gray[900],
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  spinner: {
    padding: spacing.lg,
  },
  noFriends: {
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  noFriendsText: {
    ...typography.body,
    color: palette.gray[700],
  },
  link: {
    ...typography.subheadline,
    color: palette.blue[500],
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
  rowLabel: {
    flexShrink: 1,
    gap: 2,
  },
  rowText: {
    fontSize: 17,
    color: palette.gray[900],
  },
  rowHint: {
    fontSize: 13,
    color: palette.gray[500],
  },
  rowTag: {
    fontSize: 13,
    color: palette.gray[500],
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
  roles: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  sentence: {
    ...typography.footnote,
    color: palette.gray[500],
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  lineError: {
    ...typography.subheadline,
    color: palette.red[700],
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: palette.blue[500],
  },
  action: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  primaryDisabled: {
    backgroundColor: palette.gray[300],
  },
  primaryPressed: {
    opacity: 0.8,
  },
  primaryText: {
    fontSize: 17,
    fontWeight: '600',
    color: palette.white,
  },
});
