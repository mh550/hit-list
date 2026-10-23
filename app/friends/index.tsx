import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { SupabaseClient } from '@supabase/supabase-js';

import { AccountsNotSetUp, Button } from '@/src/components';
import { palette, radius, spacing, typography } from '@/src/constants/theme';
import { useAuthStore } from '@/src/stores/auth-store';
import { useFriendsStore } from '@/src/stores/friends-store';
import { getSupabase } from '@/src/sync/client';
import { errorMessage } from '@/src/sync/errors';
import {
  addFriend,
  block,
  normaliseUsername,
  refreshFriends,
  removeFriend,
  unblock,
  type AddResult,
  type FriendProfile,
} from '@/src/sync/friends';

/*
 * Profile → Friends (S6-03, docs/plans/2026-10-22-s6-friends.md "Friends"): add by exact @username, the rider's
 * friends (long press: Remove / Block), requests they sent (Cancel) and riders they blocked (Unblock, D74). Incoming
 * requests live in the Inbox. Every action is single-flight per row and ends with a friends load; server errors are
 * warned and read as one fixed line.
 */

const HINT = "Friends are added by exact username or by an invite link. There's no search by name.";
const INVALID = 'Usernames are 3–20 letters, numbers, _ or .';
const NETWORK = "Couldn't reach the server. Try again.";
const LOAD_FAILED = "Couldn't reach the server. Pull to try again.";
const BLOCK_MESSAGE = "They won't be told. They can't send to you or invite you.";

type Line = { text: string; tone: 'ok' | 'error' };

/** What Add says; `name` is the typed name as the server stores it. D50: 'not found' covers a rider who blocked you. */
function addLine(result: AddResult, name: string): Line {
  if (result.status === 'invalid') return { text: INVALID, tone: 'error' };
  if (!result.found) return { text: `No rider named @${name}`, tone: 'error' };
  const handle = `@${result.profile.username ?? name}`;
  switch (result.status) {
    case 'sent':
      return { text: `Request sent to ${handle}`, tone: 'ok' };
    case 'accepted':
      return { text: `You're now friends with ${handle}`, tone: 'ok' };
    case 'already_friends':
      return { text: `Already friends with ${handle}`, tone: 'ok' };
    case 'already_sent':
      return { text: `Request already sent to ${handle}`, tone: 'ok' };
    case 'self':
      return { text: "That's you", tone: 'error' };
    case 'blocked_by_me':
      return { text: `You blocked ${handle}. Unblock them below to add them.`, tone: 'error' };
  }
}

type RowKind = 'friend' | 'outgoing' | 'blocked';
interface Row {
  /** The busy key: a friendship id, or the blocked rider's id. */
  key: string;
  kind: RowKind;
  friendshipId: string | null;
  profile: FriendProfile;
}

/** '@ana' or the line for a rider whose name this phone doesn't know (D73). */
function handleOf(profile: FriendProfile, unknown: string): string {
  return profile.username ? `@${profile.username}` : unknown;
}

const UNKNOWN: Record<RowKind, string> = {
  friend: 'A rider',
  outgoing: 'A rider you asked',
  blocked: 'A rider you blocked',
};

function rowText(row: Row): string {
  const handle = handleOf(row.profile, UNKNOWN[row.kind]);
  return row.kind === 'friend' && row.profile.display_name ? `${handle} · ${row.profile.display_name}` : handle;
}

function FriendsBody({ client, uid }: { client: SupabaseClient; uid: string }) {
  const db = useSQLiteContext();
  const router = useRouter();
  const friends = useFriendsStore((s) => s.friends);
  const outgoing = useFriendsStore((s) => s.outgoing);
  const blocked = useFriendsStore((s) => s.blocked);
  const incomingCount = useFriendsStore((s) => s.incoming.length);
  const loadError = useFriendsStore((s) => s.loadError);

  const [typed, setTyped] = useState('');
  const [line, setLine] = useState<Line | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  // A second tap can land before the busy state renders: these are checked synchronously.
  const addInFlight = useRef(false);
  const busyKeys = useRef(new Set<string>());

  useEffect(() => {
    void refreshFriends(db, client, uid);
  }, [db, client, uid]);

  const sections = useMemo(() => {
    const all: { title: string; data: Row[] }[] = [
      {
        title: 'Friends',
        data: friends.map((f) => ({ key: f.friendshipId, kind: 'friend', friendshipId: f.friendshipId, profile: f.profile })),
      },
      {
        title: 'Requests sent',
        data: outgoing.map((f) => ({
          key: f.friendshipId,
          kind: 'outgoing',
          friendshipId: f.friendshipId,
          profile: f.profile,
        })),
      },
      {
        title: 'Blocked',
        data: blocked.map((p) => ({ key: p.id, kind: 'blocked', friendshipId: null, profile: p })),
      },
    ];
    return all.filter((s) => s.data.length > 0);
  }, [friends, outgoing, blocked]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    if (busyKeys.current.has(key)) return;
    busyKeys.current.add(key);
    setBusy(new Set(busyKeys.current));
    setLine(null);
    try {
      await action();
    } catch (err) {
      console.warn('[Friends] the action failed:', errorMessage(err));
      setLine({ text: NETWORK, tone: 'error' });
    }
    // Free the row now: the load waits its turn on the sync queue, behind a backup that may take minutes.
    busyKeys.current.delete(key);
    setBusy(new Set(busyKeys.current));
    void refreshFriends(db, client, uid);
  };

  const submit = async () => {
    if (addInFlight.current) return;
    const name = normaliseUsername(typed);
    if (!name) {
      setLine({ text: INVALID, tone: 'error' });
      return;
    }
    addInFlight.current = true;
    setAdding(true);
    setLine(null);
    try {
      const result = await addFriend(client, db, uid, typed);
      // null: the session ended while the screen was open (it turns to Sign in once the account store catches up)
      setLine(result ? addLine(result, name) : { text: NETWORK, tone: 'error' });
      if (result?.status === 'sent' || result?.status === 'accepted') setTyped('');
      if (result) void refreshFriends(db, client, uid);
    } catch (err) {
      console.warn('[Friends] Add failed:', errorMessage(err));
      setLine({ text: NETWORK, tone: 'error' });
    } finally {
      addInFlight.current = false;
      setAdding(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshFriends(db, client, uid);
    setRefreshing(false);
  };

  const confirmBlock = (row: Row) => {
    const handle = handleOf(row.profile, 'this rider');
    Alert.alert(`Block ${handle}?`, BLOCK_MESSAGE, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () => void runAction(row.key, () => block(client, uid, row.profile.id)),
      },
    ]);
  };

  const remove = (row: Row) => {
    const friendshipId = row.friendshipId;
    if (friendshipId) void runAction(row.key, () => removeFriend(client, uid, friendshipId));
  };

  const friendMenu = (row: Row) => {
    Alert.alert(handleOf(row.profile, UNKNOWN.friend), undefined, [
      { text: 'Remove friend', onPress: () => remove(row) },
      { text: `Block ${handleOf(row.profile, 'this rider')}`, style: 'destructive', onPress: () => confirmBlock(row) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const renderItem = ({ item }: { item: Row }) => {
    const text = rowText(item);
    const isBusy = busy.has(item.key);
    const action =
      item.kind === 'outgoing' ? (
        <Button
          title="Cancel"
          variant="secondary"
          size="sm"
          accessibilityLabel={`Cancel request to ${handleOf(item.profile, 'a rider you asked')}`}
          onPress={() => remove(item)}
        />
      ) : item.kind === 'blocked' ? (
        <Button
          title="Unblock"
          variant="secondary"
          size="sm"
          accessibilityLabel={`Unblock ${handleOf(item.profile, 'a rider you blocked')}`}
          onPress={() => void runAction(item.key, () => unblock(client, uid, item.profile.id))}
        />
      ) : null;
    const label = (
      <Text style={styles.rowText} numberOfLines={1}>
        {text}
      </Text>
    );
    const busyMark = isBusy ? <ActivityIndicator color={palette.gray[500]} /> : null;
    // Sent and blocked rows are plain Views: a Pressable would group the row into one VoiceOver element and hide
    // its Cancel / Unblock button.
    if (item.kind !== 'friend') {
      return (
        <View style={styles.row}>
          {label}
          {busyMark ?? action}
        </View>
      );
    }
    // A friend row: long press, or VoiceOver's actions rotor, for Remove / Block.
    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onLongPress={() => friendMenu(item)}
        disabled={isBusy}
        accessibilityRole="button"
        accessibilityLabel={text}
        accessibilityHint="Long press to remove or block"
        accessibilityActions={[
          { name: 'remove', label: 'Remove friend' },
          { name: 'block', label: `Block ${handleOf(item.profile, 'this rider')}` },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'remove') remove(item);
          else if (event.nativeEvent.actionName === 'block') confirmBlock(item);
        }}>
        {label}
        {busyMark}
      </Pressable>
    );
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          value={typed}
          onChangeText={setTyped}
          placeholder="Add by exact @username"
          placeholderTextColor={palette.gray[400]}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="send"
          onSubmitEditing={() => void submit()}
          accessibilityLabel="Add by exact @username"
        />
        <Button title="Add" onPress={() => void submit()} disabled={adding} />
      </View>
      <Text style={styles.hint}>{HINT}</Text>
      {line ? (
        <Text
          style={line.tone === 'error' ? styles.lineError : styles.lineOk}
          accessibilityLiveRegion="polite">
          {line.text}
        </Text>
      ) : null}
      {loadError ? <Text style={styles.lineError}>{LOAD_FAILED}</Text> : null}
      {incomingCount > 0 ? (
        <Pressable accessibilityRole="link" onPress={() => router.dismissTo('/inbox')} hitSlop={spacing.sm}>
          <Text style={styles.link}>
            {incomingCount === 1 ? '1 friend request in Inbox' : `${incomingCount} friend requests in Inbox`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <SectionList
      style={styles.container}
      sections={sections}
      keyExtractor={(row) => `${row.kind}:${row.key}`}
      renderItem={renderItem}
      renderSectionHeader={({ section }) => (
        <Text style={styles.sectionHeader} accessibilityRole="header">
          {section.title}
        </Text>
      )}
      ListHeaderComponent={header}
      ItemSeparatorComponent={Separator}
      stickySectionHeadersEnabled={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      contentContainerStyle={styles.content}
    />
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

export default function FriendsScreen() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const userId = useAuthStore((s) => s.userId);
  const client = getSupabase();

  if (!client || status === 'unconfigured') return <AccountsNotSetUp />;
  if (status !== 'signed_in' || !userId) {
    return (
      <View style={styles.signedOut}>
        <Text style={styles.signedOutText}>Sign in to add friends</Text>
        <Button title="Sign in" onPress={() => router.push('/auth/sign-in')} />
      </View>
    );
  }
  // A new account starts fresh: no typed name, result line or busy row from the one before.
  return <FriendsBody key={userId} client={client} uid={userId} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing['3xl'],
  },
  header: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.gray[300],
    borderRadius: radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: palette.gray[900],
    backgroundColor: palette.white,
  },
  hint: {
    ...typography.footnote,
    color: palette.gray[500],
  },
  link: {
    ...typography.subheadline,
    color: palette.blue[500],
  },
  lineOk: {
    ...typography.subheadline,
    color: palette.gray[900],
  },
  lineError: {
    ...typography.subheadline,
    color: palette.red[700],
  },
  sectionHeader: {
    ...typography.headline,
    color: palette.gray[900],
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  rowPressed: {
    backgroundColor: palette.gray[100],
  },
  rowText: {
    ...typography.body,
    flex: 1,
    color: palette.gray[900],
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.gray[200],
    marginLeft: spacing.lg,
  },
  signedOut: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  signedOutText: {
    ...typography.callout,
    color: palette.gray[700],
    textAlign: 'center',
  },
});
