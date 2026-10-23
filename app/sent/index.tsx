import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { SupabaseClient } from '@supabase/supabase-js';

import { AccountsNotSetUp, Button } from '@/src/components';
import { palette, spacing, typography } from '@/src/constants/theme';
import { useSentSends } from '@/src/hooks/use-sent-sends';
import { useAuthStore } from '@/src/stores/auth-store';
import { getSupabase } from '@/src/sync/client';
import { errorMessage } from '@/src/sync/errors';
import { withdrawSend, type SentSend, type SentStatus } from '@/src/sync/sends';
import { spotCountLabel } from '@/src/utils/spot-name';

/*
 * Profile → Sent (S7-05, docs/plans/2026-10-22-s7-send.md "Sent"): every send the rider made to a friend, newest
 * first, with its status. A waiting one can be withdrawn (D40: until it is saved); a saved one is theirs now. A
 * dismissed send still reads Waiting (D82). Withdraw is single-flight per row.
 */

const STATUS_LABELS: Record<SentStatus, string> = {
  waiting: 'Waiting',
  saved: 'Saved',
  withdrawn: 'Withdrawn',
};

const LOAD_FAILED = "Couldn't reach the server. Pull to try again.";

const handleOf = (send: SentSend) => (send.to.username ? `@${send.to.username}` : 'a rider');

function SentBody({ client, uid }: { client: SupabaseClient; uid: string }) {
  const { sends, error, refreshing, refresh } = useSentSends();
  // what a Withdraw learned, until (and after) the next read says the same: both outcomes are final
  const [settled, setSettled] = useState<Readonly<Record<string, SentStatus>>>({});
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  // A second tap can land before the busy state renders: checked synchronously.
  const busyIds = useRef(new Set<string>());

  const withdraw = async (send: SentSend) => {
    if (busyIds.current.has(send.id)) return;
    busyIds.current.add(send.id);
    setBusy(new Set(busyIds.current));
    try {
      const result = await withdrawSend(client, uid, send);
      if (result === null) throw new Error('not signed in');
      setSettled((prev) => ({ ...prev, [send.id]: result }));
      if (result === 'saved') Alert.alert('They already saved these.');
      void refresh();
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

  const renderItem = ({ item }: { item: SentSend }) => {
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

  let empty;
  if (sends === null && !error) empty = <ActivityIndicator style={styles.spinner} color={palette.gray[500]} />;
  else if (sends === null) empty = <Text style={styles.emptyText}>{LOAD_FAILED}</Text>;
  else empty = <Text style={styles.emptyText}>Nothing sent yet</Text>;

  return (
    <FlatList
      style={styles.container}
      data={sends ?? []}
      keyExtractor={(send) => send.id}
      renderItem={renderItem}
      ListHeaderComponent={error && sends ? <Text style={styles.error}>{LOAD_FAILED}</Text> : null}
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
