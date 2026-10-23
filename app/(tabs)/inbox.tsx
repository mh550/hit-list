import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
} from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { SupabaseClient } from '@supabase/supabase-js';

import { AccountsNotSetUp, Button, confirmBlock } from '@/src/components';
import { palette, spacing, typography } from '@/src/constants/theme';
import { useAuthStore } from '@/src/stores/auth-store';
import { INBOX_KINDS, useInboxStore, type FriendRequestItem, type InboxItem, type InboxKind } from '@/src/stores/inbox-store';
import { getSupabase } from '@/src/sync/client';
import { errorMessage } from '@/src/sync/errors';
import { block, refreshFriends, respond } from '@/src/sync/friends';

/*
 * The Inbox tab (S6-04, docs/plans/2026-10-22-s6-friends.md "Inbox tab"): everything addressed to the rider, one
 * section per kind in a fixed order (friend requests now; S7 sends, S8 invitations). Focused while the app is active,
 * it marks every item seen (D75), which clears the tab's badge. Accept / Decline / Block are single-flight per row.
 */

const EMPTY_BODY = 'Spots friends send you, hit list invitations and friend requests show up here.';

const SECTION_TITLES: Record<InboxKind, string> = {
  friend_request: 'Friend requests',
  send: 'Spots sent to you',
  invite: 'Invitations',
};

const isActive = (state: AppStateStatus) => state !== 'background' && state !== 'inactive';

/** Whether the app is in the foreground: a request that lands in the background must stay unseen. */
function useAppActive(): boolean {
  const [active, setActive] = useState(() => isActive(AppState.currentState));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setActive(isActive(state)));
    return () => subscription.remove();
  }, []);
  return active;
}

const newestFirst = (a: InboxItem, b: InboxItem) => b.created_at.localeCompare(a.created_at);

function InboxBody({ client, uid }: { client: SupabaseClient; uid: string }) {
  const db = useSQLiteContext();
  const items = useInboxStore((s) => s.items);
  const isFocused = useIsFocused();
  const appActive = useAppActive();

  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  // A second tap can land before the busy state renders: checked synchronously.
  const busyKeys = useRef(new Set<string>());

  useEffect(() => {
    if (isFocused) void refreshFriends(db, client, uid);
  }, [isFocused, db, client, uid]);

  useEffect(() => {
    if (!isFocused || !appActive || items.length === 0) return;
    useInboxStore
      .getState()
      .markSeen(db, uid)
      .catch((err: unknown) => console.warn('[Inbox] saving the seen mark failed:', errorMessage(err)));
  }, [isFocused, appActive, items, db, uid]);

  const sections = useMemo(
    () =>
      INBOX_KINDS.map((kind) => ({
        kind,
        title: SECTION_TITLES[kind],
        data: items.filter((i) => i.kind === kind).sort(newestFirst),
      })).filter((s) => s.data.length > 0),
    [items],
  );

  /** Answers or blocks `item`'s request; once that went through, the row leaves at once (no second answer to it). */
  const runAction = async (item: InboxItem, action: () => Promise<void>) => {
    const key = item.id;
    if (busyKeys.current.has(key)) return;
    busyKeys.current.add(key);
    setBusy(new Set(busyKeys.current));
    try {
      await action();
      useInboxStore.getState().removeItem(uid, item.kind, item.id);
    } catch (err) {
      console.warn('[Inbox] the action failed:', errorMessage(err));
      Alert.alert("Couldn't reach the server", 'Try again.');
    }
    // Free the row now: the load waits its turn on the sync queue, behind a backup that may take minutes.
    busyKeys.current.delete(key);
    setBusy(new Set(busyKeys.current));
    void refreshFriends(db, client, uid);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshFriends(db, client, uid);
    setRefreshing(false);
  };

  const askBlock = (item: FriendRequestItem, handle: string) =>
    confirmBlock(handle, () => void runAction(item, () => block(client, uid, item.from.id)));

  const renderRequest = (item: FriendRequestItem) => {
    const handle = item.from.username ? `@${item.from.username}` : 'this rider';
    const line = `${item.from.username ? `@${item.from.username}` : 'A rider'} wants to be friends`;
    const isBusy = busy.has(item.id);
    return (
      <View style={styles.row}>
        <Pressable
          style={({ pressed }) => [styles.rowText, pressed && styles.rowPressed]}
          onLongPress={() =>
            Alert.alert(item.from.username ? handle : 'A rider', undefined, [
              { text: `Block ${handle}`, style: 'destructive', onPress: () => askBlock(item, handle) },
              { text: 'Cancel', style: 'cancel' },
            ])
          }
          disabled={isBusy}
          accessibilityRole="button"
          accessibilityLabel={item.from.display_name ? `${line}, ${item.from.display_name}` : line}
          accessibilityHint="Long press to block"
          accessibilityActions={[{ name: 'block', label: `Block ${handle}` }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'block') askBlock(item, handle);
          }}>
          <Text style={styles.title} numberOfLines={2}>
            {line}
          </Text>
          {item.from.display_name ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {item.from.display_name}
            </Text>
          ) : null}
        </Pressable>
        {isBusy ? (
          <ActivityIndicator color={palette.gray[500]} accessibilityLabel="Sending your answer" />
        ) : (
          <View style={styles.actions}>
            <Button
              title="Accept"
              size="sm"
              accessibilityLabel={`Accept friend request from ${handle}`}
              onPress={() => void runAction(item, () => respond(client, uid, item.friendshipId, 'accept'))}
            />
            <Button
              title="Decline"
              variant="secondary"
              size="sm"
              accessibilityLabel={`Decline friend request from ${handle}`}
              onPress={() => void runAction(item, () => respond(client, uid, item.friendshipId, 'decline'))}
            />
          </View>
        )}
      </View>
    );
  };

  const renderItem = ({ item }: { item: InboxItem }) => {
    switch (item.kind) {
      case 'friend_request':
        return renderRequest(item);
      case 'send': {
        // the line only: Save all, Save into a new hit list, Pick spots and Dismiss come with S7-05
        const count = item.payload.spots.length;
        return (
          <View style={styles.row}>
            <Text style={[styles.title, styles.rowText]} numberOfLines={2}>
              {`@${item.from.username} sent you ${count === 1 ? 'a spot' : `${count} spots`}`}
            </Text>
          </View>
        );
      }
      default: {
        // S8 adds its kind here; a kind without a row is a type error
        const unhandled: never = item;
        console.warn('[Inbox] no row for', (unhandled as InboxItem).kind);
        return null;
      }
    }
  };

  return (
    <SectionList
      style={styles.container}
      sections={sections}
      keyExtractor={(item) => `${item.kind}:${item.id}`}
      renderItem={renderItem}
      renderSectionHeader={({ section }) => (
        <Text style={styles.sectionHeader} accessibilityRole="header">
          {section.title}
        </Text>
      )}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptyBody}>{EMPTY_BODY}</Text>
        </View>
      }
      ItemSeparatorComponent={Separator}
      stickySectionHeadersEnabled={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      contentContainerStyle={styles.content}
    />
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

export default function InboxTab() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const userId = useAuthStore((s) => s.userId);
  const client = getSupabase();

  if (!client || status === 'unconfigured') return <AccountsNotSetUp />;
  if (status !== 'signed_in' || !userId) {
    return (
      <View style={styles.signedOut}>
        <Text style={styles.signedOutText}>Sign in to get spots from friends</Text>
        <Button title="Sign in" onPress={() => router.push('/auth/sign-in')} />
      </View>
    );
  }
  // A new account starts fresh: no busy row from the one before.
  return <InboxBody key={userId} client={client} uid={userId} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingBottom: spacing['3xl'],
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
  rowText: {
    flex: 1,
    gap: spacing.xs,
  },
  rowPressed: {
    opacity: 0.6,
  },
  title: {
    ...typography.body,
    color: palette.gray[900],
  },
  subtitle: {
    ...typography.footnote,
    color: palette.gray[500],
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.gray[200],
    marginLeft: spacing.lg,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  emptyTitle: {
    ...typography.headline,
    color: palette.gray[900],
  },
  emptyBody: {
    ...typography.callout,
    color: palette.gray[500],
    textAlign: 'center',
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
