import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { SupabaseClient } from '@supabase/supabase-js';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { palette, radius, spacing, typography } from '@/src/constants/theme';
import { useMediaStore, useSpotsStore } from '@/src/stores';
import { useAuthStore } from '@/src/stores/auth-store';
import { useFriendsStore } from '@/src/stores/friends-store';
import { showToast } from '@/src/stores/toast-store';
import { getSupabase } from '@/src/sync/client';
import { syncNow } from '@/src/sync/engine';
import { refreshProfile } from '@/src/sync/auth';
import { errorMessage } from '@/src/sync/errors';
import { refreshFriends, type FriendProfile } from '@/src/sync/friends';
import type { LinkExpiry } from '@/src/sync/links';
import { createSend, makeSendLink, NotBackedUpError } from '@/src/sync/sends';
import { resolvePhotoUri } from '@/src/utils/photo-storage';
import { MAX_SEND_SPOTS } from '@/src/utils/send-payload';
import { spotCountLabel } from '@/src/utils/spot-name';
import { primaryPhoto } from '@/src/utils/spot-photos';
import { ACCOUNTS_NOT_SET_UP } from './AuthScreen';
import { Button } from './Button';
import { Chip, ChipGroup } from './Chip';

/*
 * Send (S7-04, docs/plans/2026-10-22-s7-send.md "Send sheet"): a one-time copy of `spotIds` to the friends the rider
 * checks (D40). The word is always Send, and the sentence under the friends says what it is (D34). Mounted per open,
 * so every open starts with nobody checked.
 *
 * Copy link instead (S9-03, docs/plans/2026-10-22-s9-links.md "UI (S9-03)"): the same spots as one send nobody is named
 * on, behind a link anyone can open until it expires (D44). Still a frozen copy, so still the word Send, never the live
 * word (a test reads this file).
 */

const NOT_BACKED_UP = "Some of these spots aren't backed up yet. Try again when you're online.";
const FAILED = "Couldn't send. Try again.";
const PROFILE_FAILED = "Couldn't load your profile. Try again.";
const LOAD_FAILED = "Couldn't load your friends.";
const LINK_FAILED = "Couldn't make the link. Try again.";
/** D44, verbatim. */
const LINK_SENTENCE = 'Anyone with the link can see these spots until it expires. No account needed to look.';
const EXPIRIES: { value: LinkExpiry; label: string }[] = [
  { value: '1d', label: '1 day' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'never', label: 'Never' },
];
const THUMBNAILS = 3;

const handleOf = (p: FriendProfile) => (p.username ? `@${p.username}` : 'A rider');

/** 'Sent to @ana' · 'Sent to @ana and @ben' · 'Sent to 3 friends'. */
function sentTo(friends: FriendProfile[]): string {
  if (friends.length === 1) return `Sent to ${handleOf(friends[0])}`;
  if (friends.length === 2) return `Sent to ${handleOf(friends[0])} and ${handleOf(friends[1])}`;
  return `Sent to ${friends.length} friends`;
}

/** D34, verbatim. */
function copySentence(count: number): string {
  return count === 1
    ? "They get a copy of this spot as it is now. Changes you make later won't reach them."
    : `They get a copy of these ${count} spots as they are now. Changes you make later won't reach them.`;
}

interface Props {
  /** The spots to send: one from a spot's page, a selection, a list's spots or an area's. */
  spotIds: string[];
  onClose: () => void;
}

export function SendSheet({ spotIds, onClose }: Props) {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const userId = useAuthStore((s) => s.userId);
  const client = getSupabase();
  // Lifted from the body. The backup before a send may take minutes (a big import): Cancel works then and the send
  // doesn't go. Once the send itself runs the sheet can't be closed, so its finish never closes what opened next.
  const [phase, setPhase] = useState<SendPhase>(null);
  const cancelledRef = useRef(false);
  const sending = phase === 'sending';
  const close = () => {
    if (sending) return;
    if (phase === 'backing_up') cancelledRef.current = true;
    onClose();
  };
  const title = spotIds.length === 1 ? 'Send this spot' : `Send ${spotIds.length} spots`;

  let body: ReactNode;
  if (!client || status === 'unconfigured') {
    body = <Text style={styles.centeredText}>{ACCOUNTS_NOT_SET_UP}</Text>;
  } else if (status !== 'signed_in' || !userId) {
    body = (
      <View style={styles.centered}>
        <Text style={styles.centeredText}>Sign in to send spots to friends</Text>
        <Button
          title="Sign in"
          onPress={() => {
            onClose();
            router.push('/auth/sign-in');
          }}
        />
      </View>
    );
  } else {
    // A new account starts fresh: nobody checked, no line from the one before.
    body = (
      <SendBody
        key={userId}
        client={client}
        uid={userId}
        spotIds={spotIds}
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
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Pressable
            onPress={close}
            disabled={sending}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            accessibilityState={{ disabled: sending }}>
            <Text style={[styles.cancel, sending && styles.cancelDisabled]}>Cancel</Text>
          </Pressable>
        </View>
        {body}
      </View>
    </Modal>
  );
}

type SendPhase = null | 'backing_up' | 'sending';

function SendBody({
  client,
  uid,
  spotIds,
  onClose,
  phase,
  setPhase,
  cancelledRef,
}: Props & {
  client: SupabaseClient;
  uid: string;
  phase: SendPhase;
  setPhase: (phase: SendPhase) => void;
  cancelledRef: { current: boolean };
}) {
  const db = useSQLiteContext();
  const router = useRouter();
  const username = useAuthStore((s) => s.username);
  const displayName = useAuthStore((s) => s.displayName);
  const friendsUid = useFriendsStore((s) => s.userId);
  const friendRows = useFriendsStore((s) => s.friends);
  const loadError = useFriendsStore((s) => s.loadError);
  const spots = useSpotsStore((s) => s.spots);
  const mediaBySpot = useMediaStore((s) => s.mediaBySpot);
  const [checked, setChecked] = useState<string[]>([]);
  const [mode, setMode] = useState<'friends' | 'link'>('friends');
  const [expiry, setExpiry] = useState<LinkExpiry>('30d');
  const [line, setShownLine] = useState<string | null>(null);
  // A live region is Android only: VoiceOver hears a line when it is set.
  const setLine = (text: string | null) => {
    setShownLine(text);
    if (text) AccessibilityInfo.announceForAccessibility(text);
  };
  // Checked synchronously: a second tap before the re-render must not send twice.
  const busy = useRef(false);

  const loaded = friendsUid === uid;
  // The friends load with every sync; a sheet opened before the first one asks for it.
  useEffect(() => {
    if (!loaded) void refreshFriends(db, client, uid);
  }, [loaded, db, client, uid]);

  const friends = useMemo(() => friendRows.map((f) => f.profile), [friendRows]);
  // A friend a sync removed (or the rider blocked) since they were checked is no longer sent to.
  const recipientIds = useMemo(() => checked.filter((id) => friends.some((f) => f.id === id)), [checked, friends]);
  const thumbnails = useMemo(() => {
    const byId = new Map(spots.map((s) => [s.id, s]));
    const uris: string[] = [];
    for (const id of spotIds) {
      const spot = byId.get(id);
      const photo = spot ? primaryPhoto(spot, mediaBySpot[id]) : undefined;
      if (photo) uris.push(resolvePhotoUri(photo.file_path));
      if (uris.length === THUMBNAILS) break;
    }
    return uris;
  }, [spots, mediaBySpot, spotIds]);

  const toggle = (id: string) =>
    setChecked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const send = async () => {
    if (busy.current || recipientIds.length === 0) return;
    if (!username) {
      // The profile didn't load (an offline launch): say so and read it again; the next tap sends.
      setLine(PROFILE_FAILED);
      await refreshProfile(client, uid);
      return;
    }
    busy.current = true;
    cancelledRef.current = false;
    setPhase('backing_up');
    setLine(null);
    try {
      // Back up first, so a spot saved a moment ago can go (D78).
      await syncNow(db);
      if (cancelledRef.current) return;
      setPhase('sending');
      const result = await createSend(db, client, uid, {
        spotIds,
        recipientIds,
        sender: { username, display_name: displayName },
      });
      if (result && !result.failed) {
        showToast(sentTo(result.sentTo));
        onClose();
        return;
      }
      if (result && result.sentTo.length > 0) {
        // The ones before the failure got theirs: Try again sends only to the rest.
        const done = new Set(result.sentTo.map((f) => f.id));
        setChecked((prev) => prev.filter((id) => !done.has(id)));
        setLine(`${sentTo(result.sentTo)}. Couldn't send to ${handleOf(result.failed!.to)}. Try again.`);
      } else {
        setLine(FAILED);
      }
    } catch (err) {
      if (err instanceof NotBackedUpError) {
        setLine(NOT_BACKED_UP);
      } else {
        console.warn('[send sheet] send failed:', errorMessage(err));
        setLine(FAILED);
      }
    } finally {
      busy.current = false;
      setPhase(null);
    }
  };

  const copyLink = async () => {
    if (busy.current) return;
    if (!username) {
      setLine(PROFILE_FAILED);
      await refreshProfile(client, uid);
      return;
    }
    busy.current = true;
    cancelledRef.current = false;
    setPhase('backing_up');
    setLine(null);
    try {
      await syncNow(db);
      if (cancelledRef.current) return;
      setPhase('sending');
      const url = await makeSendLink(db, client, uid, {
        spotIds,
        sender: { username, display_name: displayName },
        expiry,
      });
      if (url) {
        await Clipboard.setStringAsync(url);
        showToast('Link copied');
        onClose();
        return;
      }
      setLine(LINK_FAILED);
    } catch (err) {
      if (err instanceof NotBackedUpError) {
        setLine(NOT_BACKED_UP);
      } else {
        console.warn('[send sheet] link failed:', errorMessage(err));
        setLine(LINK_FAILED);
      }
    } finally {
      busy.current = false;
      setPhase(null);
    }
  };

  const switchTo = (next: 'friends' | 'link') => {
    setMode(next);
    setLine(null);
  };

  if (spotIds.length > MAX_SEND_SPOTS) {
    return (
      <Text style={styles.centeredText}>
        {`That's ${spotIds.length} spots. Send up to ${MAX_SEND_SPOTS} at a time.`}
      </Text>
    );
  }

  let recipients: ReactNode;
  if (!loaded) {
    recipients = loadError ? (
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
    recipients = (
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
    recipients = friends.map((friend) => {
      const on = checked.includes(friend.id);
      const handle = handleOf(friend);
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
            {friend.display_name ? (
              <Text style={styles.rowHint} numberOfLines={1}>
                {friend.display_name}
              </Text>
            ) : null}
          </View>
          <View style={[styles.box, on && styles.boxChecked]}>
            {on ? <IconSymbol name="checkmark" size={16} color={palette.white} /> : null}
          </View>
        </Pressable>
      );
    });
  }

  const idle = phase === null;
  const canSend = recipientIds.length > 0 && idle;
  const errorLine = line ? (
    <Text style={styles.lineError} accessibilityRole="alert" accessibilityLiveRegion="polite">
      {line}
    </Text>
  ) : null;
  const spotsRow = (
    <View style={styles.spots}>
      {thumbnails.map((uri) => (
        <Image key={uri} source={{ uri }} style={styles.thumbnail} contentFit="cover" accessible={false} />
      ))}
      <Text style={styles.count}>{spotCountLabel(spotIds.length)}</Text>
    </View>
  );
  const toggleRow = (label: string, next: 'friends' | 'link') => (
    <Pressable
      onPress={() => switchTo(next)}
      disabled={!idle}
      style={styles.toggle}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !idle }}>
      <Text style={[styles.link, !idle && styles.linkDisabled]}>{label}</Text>
    </Pressable>
  );

  if (mode === 'link') {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        {spotsRow}
        <View style={styles.chips}>
          <ChipGroup>
            {EXPIRIES.map((e) => (
              <Chip
                key={e.value}
                label={e.label}
                role="button"
                selected={expiry === e.value}
                disabled={!idle}
                onPress={() => setExpiry(e.value)}
              />
            ))}
          </ChipGroup>
        </View>
        <Text style={styles.sentence}>{LINK_SENTENCE}</Text>
        {errorLine}
        <Pressable
          onPress={copyLink}
          disabled={!idle}
          style={({ pressed }) => [styles.send, !idle && styles.sendDisabled, pressed && styles.sendPressed]}
          accessibilityRole="button"
          accessibilityLabel="Copy link"
          accessibilityState={{ disabled: !idle, busy: !idle }}>
          <Text style={styles.sendText}>{idle ? 'Copy link' : 'Making link…'}</Text>
        </Pressable>
        {toggleRow('Send to friends instead', 'friends')}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {spotsRow}

      <Text style={styles.sectionHeader}>Friends</Text>
      {recipients}
      {toggleRow('Copy link instead', 'link')}

      <Text style={styles.sentence}>{copySentence(spotIds.length)}</Text>
      {errorLine}
      {loaded && friends.length > 0 ? (
        <Pressable
          onPress={send}
          disabled={!canSend}
          style={({ pressed }) => [styles.send, !canSend && styles.sendDisabled, pressed && styles.sendPressed]}
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !canSend, busy: !idle }}>
          <IconSymbol name="paperplane.fill" size={18} color={palette.white} />
          <Text style={styles.sendText}>{idle ? 'Send' : 'Sending…'}</Text>
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
    paddingBottom: spacing['3xl'],
  },
  spots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    backgroundColor: palette.gray[100],
  },
  count: {
    ...typography.headline,
    color: palette.gray[900],
    marginLeft: spacing.xs,
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
  linkDisabled: {
    color: palette.gray[300],
  },
  toggle: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  chips: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
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
  sentence: {
    ...typography.footnote,
    color: palette.gray[500],
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  lineError: {
    ...typography.subheadline,
    color: palette.red[700],
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  send: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: palette.blue[500],
  },
  sendDisabled: {
    backgroundColor: palette.gray[300],
  },
  sendPressed: {
    opacity: 0.8,
  },
  sendText: {
    fontSize: 17,
    fontWeight: '600',
    color: palette.white,
  },
});
