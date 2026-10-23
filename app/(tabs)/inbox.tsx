import { useEffect, useMemo, useRef, useState } from 'react';
import { Image } from 'expo-image';
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

import { AccountsNotSetUp, Button, confirmBlock, PickSpotsSheet } from '@/src/components';
import { palette, radius, spacing, typography } from '@/src/constants/theme';
import { useAuthStore } from '@/src/stores/auth-store';
import {
  INBOX_KINDS,
  useInboxStore,
  type FriendRequestItem,
  type InboxItem,
  type InboxKind,
  type SendItem,
} from '@/src/stores/inbox-store';
import { getSupabase } from '@/src/sync/client';
import { errorMessage } from '@/src/sync/errors';
import { block, refreshFriends, respond } from '@/src/sync/friends';
import { PHOTOS_BUCKET } from '@/src/sync/photos';
import { dismissSend, loadAndApplySends, saveSend, type SaveResult } from '@/src/sync/sends';
import { frozenSpotTitle } from '@/src/utils/send-payload';
import { spotCountLabel } from '@/src/utils/spot-name';

/*
 * The Inbox tab (S6-04, docs/plans/2026-10-22-s6-friends.md "Inbox tab"): everything addressed to the rider, one
 * section per kind in a fixed order (friend requests, sends (S7-05), S8 invitations). Focused while the app is active,
 * it marks every item seen (D75), which clears the tab's badge. Every row's actions are single-flight: Accept /
 * Decline / Block, and a send's Save all / Save into a new hit list / Pick spots / Dismiss
 * (docs/plans/2026-10-22-s7-send.md "Inbox"). A save's outcome shows as one line at the top until the next action.
 */

const EMPTY_BODY = 'Spots friends send you, hit list invitations and friend requests show up here.';

const SECTION_TITLES: Record<InboxKind, string> = {
  friend_request: 'Friend requests',
  send: 'Spots sent to you',
  invite: 'Invitations',
};

const SAVE_FAILED = "Couldn't save these spots. Try again.";
/** How long a send's thumbnail URL stays valid, in seconds. */
const THUMBNAIL_TTL = 600;

const photosLabel = (n: number) => (n === 1 ? '1 photo' : `${n} photos`);

/** The line a save leaves at the top of the Inbox (the plan's Copy table). */
function savedLine(result: SaveResult | null, sender: string): string {
  if (!result || result.status === 'failed') return SAVE_FAILED;
  if (result.status === 'taken_back') return `@${sender} took these spots back.`;
  if (result.status === 'already_saved') return 'Already saved';
  const into = result.listId ? ` into From @${sender}` : '';
  const missing = result.failedPhotos > 0 ? ` · ${photosLabel(result.failedPhotos)} couldn't be downloaded` : '';
  return `Saved ${spotCountLabel(result.saved)}${into}${missing}`;
}

/** A send's first photo, read through a short-lived signed URL; nothing until (unless) it signs. */
function SendThumbnail({ client, path }: { client: SupabaseClient; path: string }) {
  const [signed, setSigned] = useState<{ path: string; uri: string } | null>(null);
  useEffect(() => {
    let live = true;
    client.storage
      .from(PHOTOS_BUCKET)
      .createSignedUrl(path, THUMBNAIL_TTL)
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        if (live) setSigned({ path, uri: data.signedUrl });
      })
      .catch((err: unknown) => console.warn('[Inbox] signing a thumbnail failed:', errorMessage(err)));
    return () => {
      live = false;
    };
  }, [client, path]);
  if (signed?.path !== path) return null;
  return (
    <Image
      testID="send-thumbnail"
      source={{ uri: signed.uri }}
      style={styles.thumbnail}
      contentFit="cover"
      accessible={false}
    />
  );
}

const keyOf = (item: InboxItem) => `${item.kind}:${item.id}`;

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
  const [notice, setNotice] = useState<string | null>(null);
  const [picking, setPicking] = useState<SendItem | null>(null);
  // A second tap can land before the busy state renders: checked synchronously.
  const busyKeys = useRef(new Set<string>());

  useEffect(() => {
    if (!isFocused) return;
    void refreshFriends(db, client, uid);
    void loadAndApplySends(db, client, uid);
    // a save's line is for this visit only
    return () => setNotice(null);
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

  /** Marks `item` busy; false when it already is (a second tap). */
  const claim = (item: InboxItem): boolean => {
    const key = keyOf(item);
    if (busyKeys.current.has(key)) return false;
    busyKeys.current.add(key);
    setBusy(new Set(busyKeys.current));
    setNotice(null);
    return true;
  };
  const release = (item: InboxItem) => {
    busyKeys.current.delete(keyOf(item));
    setBusy(new Set(busyKeys.current));
  };

  /** Answers, blocks or dismisses `item`; once that went through, the row leaves at once (no second answer to it). */
  const runAction = async (item: InboxItem, action: () => Promise<void>) => {
    if (!claim(item)) return;
    try {
      await action();
      useInboxStore.getState().removeItem(uid, item.kind, item.id);
    } catch (err) {
      console.warn('[Inbox] the action failed:', errorMessage(err));
      Alert.alert("Couldn't reach the server", 'Try again.');
    }
    // Free the row now: the load waits its turn on the sync queue, behind a backup that may take minutes.
    release(item);
    if (item.kind === 'friend_request') void refreshFriends(db, client, uid);
  };

  /** Saves `item` (all, into a new list, or the picked spots); saveSend takes it off the Inbox unless it failed. */
  const runSave = async (item: SendItem, opts: { spotIds?: string[]; newList?: boolean }) => {
    if (!claim(item)) return;
    let line: string;
    try {
      line = savedLine(await saveSend(db, client, uid, item, opts), item.from.username);
    } catch (err) {
      console.warn('[Inbox] saving the spots failed:', errorMessage(err));
      line = SAVE_FAILED;
    }
    release(item);
    setNotice(line);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshFriends(db, client, uid), loadAndApplySends(db, client, uid)]);
    setRefreshing(false);
  };

  const askBlock = (item: FriendRequestItem, handle: string) =>
    confirmBlock(handle, () => void runAction(item, () => block(client, uid, item.from.id)));

  const renderRequest = (item: FriendRequestItem) => {
    const handle = item.from.username ? `@${item.from.username}` : 'this rider';
    const line = `${item.from.username ? `@${item.from.username}` : 'A rider'} wants to be friends`;
    const isBusy = busy.has(keyOf(item));
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

  const askDismiss = (item: SendItem) =>
    Alert.alert('Dismiss these spots?', `@${item.from.username} won't be told.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Dismiss',
        style: 'destructive',
        onPress: () => void runAction(item, () => dismissSend(client, uid, item.sendId)),
      },
    ]);

  const renderSend = (item: SendItem) => {
    const { spots } = item.payload;
    const line = `@${item.from.username} sent you ${spots.length === 1 ? 'a spot' : `${spots.length} spots`}`;
    const first = spots[0];
    const firstLine = first ? [frozenSpotTitle(first), first.generated_name].filter(Boolean).join(' · ') : null;
    const photo = first?.photos[0];
    return (
      <View style={styles.sendRow}>
        <View style={styles.sendHeader}>
          {photo ? <SendThumbnail client={client} path={photo.path} /> : null}
          <View style={styles.rowText}>
            <Text style={styles.title} numberOfLines={2}>
              {line}
            </Text>
            {firstLine ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {firstLine}
              </Text>
            ) : null}
          </View>
        </View>
        {busy.has(keyOf(item)) ? (
          <ActivityIndicator
            style={styles.sendBusy}
            color={palette.gray[500]}
            accessibilityLabel="Saving these spots"
          />
        ) : (
          <View style={styles.sendActions}>
            <Button title="Save all" size="sm" onPress={() => void runSave(item, {})} />
            <Button
              title="Save into a new hit list"
              variant="secondary"
              size="sm"
              onPress={() => void runSave(item, { newList: true })}
            />
            <Button title="Pick spots" variant="secondary" size="sm" onPress={() => setPicking(item)} />
            <Button title="Dismiss" variant="secondary" size="sm" onPress={() => askDismiss(item)} />
          </View>
        )}
      </View>
    );
  };

  const renderItem = ({ item }: { item: InboxItem }) => {
    switch (item.kind) {
      case 'friend_request':
        return renderRequest(item);
      case 'send':
        return renderSend(item);
      default: {
        // S8 adds its kind here; a kind without a row is a type error
        const unhandled: never = item;
        console.warn('[Inbox] no row for', (unhandled as InboxItem).kind);
        return null;
      }
    }
  };

  return (
    <>
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
        ListHeaderComponent={
          notice ? (
            <Text style={styles.notice} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {notice}
            </Text>
          ) : null
        }
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
      {picking ? (
        <PickSpotsSheet
          spots={picking.payload.spots}
          onClose={() => setPicking(null)}
          onSave={(spotIds) => {
            setPicking(null);
            void runSave(picking, { spotIds });
          }}
        />
      ) : null}
    </>
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
  sendRow: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    backgroundColor: palette.gray[100],
  },
  sendActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  sendBusy: {
    alignSelf: 'flex-start',
    minHeight: 32,
  },
  notice: {
    ...typography.callout,
    color: palette.gray[900],
    backgroundColor: palette.gray[100],
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
