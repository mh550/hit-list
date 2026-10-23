import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { AccountsNotSetUp, Button, EmptyState, ShareListSheet } from '@/src/components';
import { ROLE_LABELS } from '@/src/constants/labels';
import { palette, radius, spacing, typography } from '@/src/constants/theme';
import { selectListSpots, useHitListsStore, useSpotsStore } from '@/src/stores';
import { useAuthStore } from '@/src/stores/auth-store';
import { showToast } from '@/src/stores/toast-store';
import { getSupabase } from '@/src/sync/client';
import { errorMessage } from '@/src/sync/errors';
import { leave, NotAllowedError, removeMember, setRole, stopSharing } from '@/src/sync/lists';
import type { HitListMember, MemberRole } from '@/src/types';
import { handleOf } from '@/src/utils/members';
import { isForeign } from '@/src/utils/ownership';
import { spotCountLabel } from '@/src/utils/spot-name';

/*
 * A shared list's members (S8-04, docs/plans/2026-10-22-s8-shared-lists.md "Share screens"): the owner, everyone who
 * joined with their role, and the invitations. The owner changes a role, removes a member or withdraws an invitation
 * from a row's menu, invites more and can stop sharing; a member can only leave. Every consequence is said before it
 * happens, and a server error reads as one fixed line.
 */

const ROLE_CHOICES: MemberRole[] = ['add', 'view'];

/** '@ben · Can add spots'; a member doesn't see an invitee's name (no profile read), so 'Invited rider'. */
function rowText(m: HitListMember, owner: boolean): string {
  if (m.status === 'invited' && !owner) return handleOf(m.username, 'Invited rider');
  return `${handleOf(m.username)} · ${ROLE_LABELS[m.role]}`;
}

/** 'Their 5 spots in Downtown will leave it too.' · none at 0 (the alert then has no message). */
function spotsLeaveLine(whose: 'Their' | 'Your', n: number, listName: string): string | undefined {
  return n === 0 ? undefined : `${whose} ${spotCountLabel(n)} in ${listName} will leave it too.`;
}

export default function MembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const uid = useAuthStore((s) => s.userId);
  const username = useAuthStore((s) => s.username);
  const list = useHitListsStore((s) => s.lists.find((l) => l.id === id && l.deleted_at === undefined));
  const membershipBySpot = useHitListsStore((s) => s.membershipBySpot);
  const spots = useSpotsStore((s) => s.spots);
  const client = getSupabase();
  const [inviting, setInviting] = useState(false);
  // Set once Leave went through: the store drops the list before the screens close, so 'gone' would flash.
  const [left, setLeft] = useState(false);
  // One server call at a time: a second tap before the answer does nothing.
  const busy = useRef(false);

  const listSpots = useMemo(
    () => (list ? selectListSpots(list, spots, membershipBySpot) : []),
    [list, spots, membershipBySpot],
  );

  if (!client || status === 'unconfigured') return <AccountsNotSetUp />;
  if (status !== 'signed_in' || !uid) {
    return (
      <View style={styles.centered}>
        <Text style={styles.centeredText}>Sign in to see who&apos;s in this list</Text>
        <Button title="Sign in" onPress={() => router.push('/auth/sign-in')} />
      </View>
    );
  }
  if (!list) {
    return left ? null : (
      <View style={styles.container}>
        <EmptyState icon="list.bullet" title="This list is gone" message="It may have been deleted." />
      </View>
    );
  }

  const owner = !isForeign(list, uid);
  const ownerName = owner ? username : list.owner_username;
  const spotsOf = (userId: string) => listSpots.filter((s) => s.owner_id === userId).length;

  /** Runs one server call; a refusal (42501) reads as its own line, anything else as `failed`. */
  const run = async (call: () => Promise<boolean>, failed: string): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    try {
      if (await call()) return true;
      Alert.alert(failed);
    } catch (err) {
      if (err instanceof NotAllowedError) {
        Alert.alert(err.message);
      } else {
        console.warn('[members] a list change failed:', errorMessage(err));
        Alert.alert(failed);
      }
    } finally {
      busy.current = false;
    }
    return false;
  };

  const confirmRemove = (m: HitListMember) => {
    const handle = handleOf(m.username);
    Alert.alert(`Remove ${handle}?`, spotsLeaveLine('Their', spotsOf(m.user_id), list.name), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          run(() => removeMember(db, client, uid, list.id, m.user_id), `Couldn't remove ${handle}. Try again.`),
      },
    ]);
  };

  const openMenu = (m: HitListMember) => {
    const handle = handleOf(m.username);
    if (m.status === 'invited') {
      Alert.alert(handle, undefined, [
        {
          text: 'Withdraw invitation',
          style: 'destructive',
          onPress: () =>
            run(() => removeMember(db, client, uid, list.id, m.user_id), "Couldn't withdraw the invitation. Try again."),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    Alert.alert(handle, undefined, [
      ...ROLE_CHOICES.map((role) => ({
        text: ROLE_LABELS[role],
        onPress: () =>
          role === m.role
            ? undefined
            : run(() => setRole(db, client, uid, list.id, m.user_id, role), "Couldn't change the role. Try again."),
      })),
      { text: 'Remove from list', style: 'destructive' as const, onPress: () => confirmRemove(m) },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const confirmStop = () => {
    Alert.alert(`Stop sharing ${list.name}?`, `Members lose access to all ${spotCountLabel(listSpots.length)} now.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Stop sharing',
        style: 'destructive',
        onPress: async () => {
          if (await run(() => stopSharing(db, client, uid, list.id), "Couldn't stop sharing. Try again.")) {
            showToast(`Stopped sharing ${list.name}`);
            router.back();
          }
        },
      },
    ]);
  };

  const confirmLeave = () => {
    Alert.alert(`Leave ${list.name}?`, spotsLeaveLine('Your', spotsOf(uid), list.name), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          setLeft(true);
          if (await run(() => leave(db, client, uid, list.id), "Couldn't leave the list. Try again.")) {
            showToast(`Left ${list.name}`);
            router.dismissAll();
            router.navigate('/(tabs)/lists');
          } else {
            setLeft(false);
          }
        },
      },
    ]);
  };

  const rows = (list.members ?? []).map((m) => {
    const text = rowText(m, owner);
    const invited = m.status === 'invited';
    const content = (
      <>
        <Text style={styles.rowText} numberOfLines={1}>
          {text}
        </Text>
        {invited ? <Text style={styles.tag}>Invited</Text> : null}
      </>
    );
    if (!owner) {
      return (
        <View key={m.user_id} style={styles.row}>
          {content}
        </View>
      );
    }
    return (
      <Pressable
        key={m.user_id}
        onPress={() => openMenu(m)}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityLabel={invited ? `${text}, Invited` : text}>
        {content}
      </Pressable>
    );
  });

  return (
    <View style={styles.container}>
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        <View style={styles.row}>
          <Text style={styles.rowText} numberOfLines={1}>{`${handleOf(ownerName)} (owner)`}</Text>
        </View>
        {rows}
        <View style={styles.actions}>
          {owner ? (
            <>
              <Button title="Invite" variant="secondary" onPress={() => setInviting(true)} />
              <Button title="Stop sharing" variant="destructive" onPress={confirmStop} />
            </>
          ) : (
            <Button title="Leave list" variant="destructive" onPress={confirmLeave} />
          )}
        </View>
      </ScrollView>
      {inviting ? <ShareListSheet listId={list.id} mode="invite" onClose={() => setInviting(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.white,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  centeredText: {
    ...typography.body,
    color: palette.gray[700],
    textAlign: 'center',
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
  tag: {
    fontSize: 13,
    color: palette.gray[500],
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    backgroundColor: palette.gray[100],
    overflow: 'hidden',
  },
  actions: {
    gap: spacing.sm,
    padding: spacing.lg,
  },
});
