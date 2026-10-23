import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { SupabaseClient } from '@supabase/supabase-js';

import { AccountsNotSetUp, Button } from '@/src/components';
import { palette, spacing, typography } from '@/src/constants/theme';
import { useSentSends } from '@/src/hooks/use-sent-sends';
import { useAuthStore } from '@/src/stores/auth-store';
import { getSupabase } from '@/src/sync/client';
import { errorMessage } from '@/src/sync/errors';
import { revokeSentLink, withdrawSend, type SentLink, type SentSend, type SentStatus } from '@/src/sync/sends';
import { formatSpotDate, spotCountLabel } from '@/src/utils/spot-name';

/*
 * Profile → Sent (S7-05, docs/plans/2026-10-22-s7-send.md "Sent"): every send the rider made to a friend, newest
 * first, with its status. A waiting one can be withdrawn (D40: until it is saved); a saved one is theirs now. A
 * dismissed send still reads Waiting (D82). Withdraw is single-flight per row.
 * Below them the send links (S9-03, docs/plans/2026-10-22-s9-links.md "UI"), newest first: an active one can be
 * revoked (D93), also single-flight per row.
 */

const STATUS_LABELS: Record<SentStatus, string> = {
  waiting: 'Waiting',
  saved: 'Saved',
  withdrawn: 'Withdrawn',
};

const LOAD_FAILED = "Couldn't reach the server. Pull to try again.";

const handleOf = (send: SentSend) => (send.to.username ? `@${send.to.username}` : 'a rider');

type LinkStatus = SentLink['status'];

/** 'Link · 3 spots · Active until Nov 21' (never expires: '… · Active'), '… · Expired', '… · Revoked'. */
function linkLabel(link: SentLink, status: LinkStatus): string {
  const until = link.expiresAt ? formatSpotDate(link.expiresAt) : '';
  const state =
    status === 'expired' ? 'Expired' : status === 'revoked' ? 'Revoked' : until ? `Active until ${until}` : 'Active';
  return `Link · ${spotCountLabel(link.count)} · ${state}`;
}

type Row = { kind: 'send'; send: SentSend } | { kind: 'link'; link: SentLink };

function SentBody({ client, uid }: { client: SupabaseClient; uid: string }) {
  const { sends, links, error, refreshing, refresh } = useSentSends();
  // what a Withdraw learned, until (and after) the next read says the same: both outcomes are final
  const [settled, setSettled] = useState<Readonly<Record<string, SentStatus>>>({});
  // the links a Revoke went through for (final too)
  const [revoked, setRevoked] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  // A second tap can land before the busy state renders: checked synchronously.
  const busyIds = useRef(new Set<string>());

  const withdraw = async (send: SentSend) => {
    if (busyIds.current.has(send.id)) return;
    busyIds.current.add(send.id);
    setBusy(new Set(busyIds.current));
    try {
      const result = await withdrawSend(client, uid, send);
      // null: the session ended meanwhile, and the screen turns to its Sign in line
      if (result !== null) {
        setSettled((prev) => ({ ...prev, [send.id]: result }));
        if (result === 'saved') Alert.alert('They already saved these.');
        void refresh({ quiet: true });
      }
    } catch (err) {
      console.warn('[Sent] withdrawing failed:', errorMessage(err));
      Alert.alert("Couldn't reach the server", 'Try again.');
    }
    busyIds.current.delete(send.id);
    setBusy(new Set(busyIds.current));
  };

  const askWithdraw = (send: SentSend) =>
    Alert.alert('Withdraw these spots?', "They won't get these spots.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: () => void withdraw(send),
      },
    ]);

  const revoke = async (link: SentLink) => {
    if (busyIds.current.has(link.id)) return;
    busyIds.current.add(link.id);
    setBusy(new Set(busyIds.current));
    try {
      // null: the session ended meanwhile, and the screen turns to its Sign in line
      if ((await revokeSentLink(client, uid, link)) !== null) {
        setRevoked((prev) => new Set(prev).add(link.id));
        void refresh({ quiet: true });
      }
    } catch (err) {
      console.warn('[Sent] revoking a link failed:', errorMessage(err));
      Alert.alert("Couldn't reach the server", 'Try again.');
    }
    busyIds.current.delete(link.id);
    setBusy(new Set(busyIds.current));
  };

  const askRevoke = (link: SentLink) =>
    Alert.alert('Revoke this link?', 'The link stops working now.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: () => void revoke(link),
      },
    ]);

  const renderLink = (link: SentLink) => {
    const status: LinkStatus = revoked.has(link.id) ? 'revoked' : link.status;
    return (
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.title} numberOfLines={2}>
            {linkLabel(link, status)}
          </Text>
        </View>
        {status !== 'active' ? null : busy.has(link.id) ? (
          <ActivityIndicator color={palette.gray[500]} accessibilityLabel="Revoking" />
        ) : (
          <Button
            title="Revoke"
            variant="secondary"
            size="sm"
            accessibilityLabel={`Revoke the link to ${spotCountLabel(link.count)}`}
            onPress={() => askRevoke(link)}
          />
        )}
      </View>
    );
  };

  const renderSend = (item: SentSend) => {
    const status = settled[item.id] ?? item.status;
    const handle = handleOf(item);
    return (
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.title} numberOfLines={2}>
            {`To ${handle} · ${spotCountLabel(item.count)} · ${STATUS_LABELS[status]}`}
          </Text>
          {status === 'saved' ? <Text style={styles.subtitle}>Saved copies are theirs</Text> : null}
        </View>
        {status !== 'waiting' ? null : busy.has(item.id) ? (
          <ActivityIndicator color={palette.gray[500]} accessibilityLabel="Withdrawing" />
        ) : (
          <Button
            title="Withdraw"
            variant="secondary"
            size="sm"
            accessibilityLabel={`Withdraw the spots sent to ${handle}`}
            onPress={() => askWithdraw(item)}
          />
        )}
      </View>
    );
  };

  // with nothing to show: still loading, a failed read (nothing known), or both lists read and empty
  let empty;
  if (error) empty = <Text style={styles.emptyText}>{LOAD_FAILED}</Text>;
  else if (sends === null || links === null)
    empty = <ActivityIndicator style={styles.spinner} color={palette.gray[500]} />;
  else empty = <Text style={styles.emptyText}>Nothing sent yet</Text>;

  const sections = [
    { key: 'sends', title: null, data: (sends ?? []).map((send): Row => ({ kind: 'send', send })) },
    { key: 'links', title: 'Links', data: (links ?? []).map((link): Row => ({ kind: 'link', link })) },
  ].filter((section) => section.data.length > 0);

  return (
    <SectionList
      style={styles.container}
      sections={sections}
      keyExtractor={(row) => (row.kind === 'send' ? `send:${row.send.id}` : `link:${row.link.id}`)}
      renderItem={({ item }) => (item.kind === 'send' ? renderSend(item.send) : renderLink(item.link))}
      renderSectionHeader={({ section }) =>
        section.title ? (
          <Text style={styles.sectionHeader} accessibilityRole="header">
            {section.title}
          </Text>
        ) : null
      }
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={error && sections.length > 0 ? <Text style={styles.error}>{LOAD_FAILED}</Text> : null}
      ListEmptyComponent={<View style={styles.empty}>{empty}</View>}
      ItemSeparatorComponent={Separator}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      contentContainerStyle={styles.content}
    />
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

export default function SentScreen() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const userId = useAuthStore((s) => s.userId);
  const client = getSupabase();

  if (!client || status === 'unconfigured') return <AccountsNotSetUp />;
  if (status !== 'signed_in' || !userId) {
    return (
      <View style={styles.signedOut}>
        <Text style={styles.signedOutText}>Sign in to see what you sent</Text>
        <Button title="Sign in" onPress={() => router.push('/auth/sign-in')} />
      </View>
    );
  }
  // A new account starts fresh: no busy row or settled status from the one before.
  return <SentBody key={userId} client={client} uid={userId} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingBottom: spacing['3xl'],
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
  sectionHeader: {
    ...typography.footnote,
    color: palette.gray[500],
    textTransform: 'uppercase',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.body,
    color: palette.gray[900],
  },
  subtitle: {
    ...typography.footnote,
    color: palette.gray[500],
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.gray[200],
    marginLeft: spacing.lg,
  },
  error: {
    ...typography.callout,
    color: palette.red[700],
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    ...typography.callout,
    color: palette.gray[500],
    textAlign: 'center',
  },
  spinner: {
    padding: spacing.lg,
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
