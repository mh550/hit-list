import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, ScrollView, View, Text, TextInput, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';

import { ACCOUNTS_NOT_SET_UP, AuthError, Button } from '@/src/components';
import { useSettingsStore } from '@/src/stores/settings-store';
import { SIGNED_OUT, useAuthStore } from '@/src/stores/auth-store';
import { useSyncStore } from '@/src/stores/sync-store';
import { countPending, resetFailed } from '@/src/db/sync';
import { syncNow } from '@/src/sync/engine';
import { releaseAccountData, removeLocalAccountData, removeReleasedRows, type ReleasedRows } from '@/src/sync/adopt';
import { useSettingsActions } from '@/src/hooks/use-settings-actions';
import { getSupabase } from '@/src/sync/client';
import { deleteAccount, signOutOfAccount } from '@/src/sync/auth';
import { palette, spacing, radius } from '@/src/constants/theme';
import { UnitSystem } from '@/src/types';
import { radiusFromInput, radiusToDisplay, radiusUnitLabel } from '@/src/utils/units';
import { relativeTime } from '@/src/utils/relative-time';

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

const DELETE_FAILED = "Couldn't delete the account. Try again.";
const REMOVE_FAILED = "Couldn't remove the spots from this phone. Try again.";
const REMOVE_WAITING = "Some changes aren't backed up yet, so nothing was removed.";

/** Sign out's last backup gives up after this long (offline it would only wait), then asks Keep / Remove anyway. */
const LAST_BACKUP_MS = 10_000;

async function lastBackup(db: SQLiteDatabase): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const giveUp = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, LAST_BACKUP_MS);
  });
  await Promise.race([syncNow(db), giveUp]);
  clearTimeout(timer);
}

/** The changes-waiting alert's title; `null` = the count could not be read. */
function waitingTitle(pending: number | null): string {
  if (pending === null) return "Some changes aren't backed up yet";
  return pending === 1 ? "1 change isn't backed up yet" : `${pending} changes aren't backed up yet`;
}

/** How often 'Backed up · 3 min ago' is worked out again while Profile is open. */
const BACKUP_LINE_TICK_MS = 60_000;

// The signed-in rider's backup (S5): when the last sync went through, and the changes that failed 10 times with Retry.
// The sync store's values count only when they are this rider's.
function BackupStatus({ userId }: { userId: string | null }) {
  const db = useSQLiteContext();
  const mine = useSyncStore((s) => s.userId !== null && s.userId === userId);
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt);
  const failedCount = useSyncStore((s) => s.failedCount);
  const syncing = useSyncStore((s) => s.syncing);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), BACKUP_LINE_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const ago = mine && lastSyncAt ? relativeTime(lastSyncAt, Math.max(now, Date.parse(lastSyncAt))) : null;
  const failed = mine ? failedCount : 0;
  const retry = async () => {
    try {
      await resetFailed(db);
    } catch (err) {
      console.warn('[Profile] Retry could not reset the failed changes:', err);
      return;
    }
    await syncNow(db);
  };

  return (
    <View style={styles.backup}>
      <Text style={styles.fieldHint}>{ago ? `Backed up · ${ago}` : 'Not backed up yet'}</Text>
      {failed > 0 ? (
        <View style={styles.backupFailed}>
          <Text style={styles.backupFailedText}>
            {failed === 1 ? '1 change not backed up' : `${failed} changes not backed up`}
          </Text>
          <Button title="Retry" variant="secondary" size="sm" onPress={() => void retry()} disabled={syncing} />
        </View>
      ) : null}
    </View>
  );
}

// The account in its three states (§3.1, §5.6): a build without Supabase values, signed out, signed in. The tabs
// redirect a 'needs_username' account to the username screen, so it shows here only for a moment, as signed in.
// Sign out backs up once more, then asks Keep / Remove from this phone, or, with changes still waiting, offers only
// Sign out anyway (D38, D69); Delete account ends with Keep / Remove too (D51, D67).
function AccountSection() {
  const router = useRouter();
  const db = useSQLiteContext();
  const status = useAuthStore((s) => s.status);
  const email = useAuthStore((s) => s.email);
  const username = useAuthStore((s) => s.username);
  const displayName = useAuthStore((s) => s.displayName);
  const userId = useAuthStore((s) => s.userId);
  const setAuth = useAuthStore((s) => s.setAuth);
  const [busy, setBusy] = useState<'signing_out' | 'deleting' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // An alert's button or a second tap can land before the disabled state renders.
  const inFlight = useRef(false);

  const client = getSupabase();
  if (!client || status === 'unconfigured') {
    return <Text style={styles.accountBody}>{ACCOUNTS_NOT_SET_UP}</Text>;
  }

  if (status === 'signed_out') {
    return (
      <View style={styles.account}>
        <Text style={styles.accountTitle}>Sign in to back up your spots and share them</Text>
        <Text style={styles.fieldHint}>
          Signing in uploads the spots already on this phone to your account. Nothing is deleted.
        </Text>
        <Button title="Sign in" onPress={() => router.push('/auth/sign-in')} />
      </View>
    );
  }

  const begin = (kind: 'signing_out' | 'deleting') => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(kind);
    setError(null);
    return true;
  };
  const end = () => {
    inFlight.current = false;
    setBusy(null);
  };
  const finishSignOut = async () => {
    await signOutOfAccount(client);
    setAuth(SIGNED_OUT);
    end();
  };

  const removeThenSignOut = async () => {
    try {
      if (userId && !(await removeLocalAccountData(db, userId))) {
        setError(REMOVE_WAITING);
        end();
        return;
      }
    } catch (err) {
      console.warn('[Profile] Remove from this phone failed:', err);
      setError(REMOVE_FAILED);
      end();
      return;
    }
    await finishSignOut();
  };

  const signOut = async () => {
    if (!begin('signing_out')) return;
    await lastBackup(db);
    let pending: number | null;
    try {
      pending = await countPending(db);
    } catch (err) {
      console.warn('[Profile] could not count the changes not backed up:', err);
      pending = null;
    }
    if (pending === 0) {
      Alert.alert('Keep spots on this phone?', "They're backed up in your account either way.", [
        { text: 'Keep', style: 'default', onPress: () => void finishSignOut() },
        { text: 'Remove from this phone', style: 'destructive', onPress: () => void removeThenSignOut() },
        { text: 'Cancel', style: 'cancel', onPress: end },
      ]);
      return;
    }
    Alert.alert(waitingTitle(pending), "Sign out anyway and they'll back up next time you sign in to this account.", [
      { text: 'Cancel', style: 'cancel', onPress: end },
      { text: 'Sign out anyway', style: 'destructive', onPress: () => void finishSignOut() },
    ]);
  };

  const deleteNow = async () => {
    if (!begin('deleting')) return;
    if (!(await deleteAccount(client))) {
      setError(DELETE_FAILED);
      end();
      return;
    }
    // Keep is applied before asking (D67): an alert never answered (the app killed) must not leave rows that the
    // next sign-in would remove as another account's.
    let released: ReleasedRows | null = null;
    if (userId) {
      try {
        released = await releaseAccountData(db, userId);
      } catch (err) {
        console.warn('[Profile] keeping the spots after Delete account failed:', err);
      }
    }
    await finishSignOut();
    if (!released) return;
    const toRemove = released;
    Alert.alert('Account deleted', 'Your account is deleted. Keep the spots on this phone?', [
      { text: 'Keep', style: 'default' },
      {
        text: 'Remove from this phone',
        style: 'destructive',
        onPress: () =>
          void removeReleasedRows(db, toRemove).catch((err: unknown) =>
            console.warn('[Profile] Remove after Delete account failed:', err),
          ),
      },
    ]);
  };

  const confirmDelete = () =>
    Alert.alert(
      'Delete your account?',
      'Your spots, photos, hit lists and sends are deleted from the server. Spots on this phone stay until you remove them.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void deleteNow() },
      ],
    );

  return (
    <View style={styles.account}>
      {username ? <Text style={styles.accountTitle}>@{username}</Text> : null}
      {displayName ? <Text style={styles.accountBody}>{displayName}</Text> : null}
      {email ? <Text style={styles.fieldHint}>{email}</Text> : null}
      <BackupStatus userId={userId} />
      <AuthError message={error} />
      <Button
        title={busy === 'signing_out' ? 'Signing out…' : 'Sign out'}
        variant="secondary"
        onPress={() => void signOut()}
        disabled={busy !== null}
      />
      <Button
        title={busy === 'deleting' ? 'Deleting…' : 'Delete account'}
        variant="destructive"
        onPress={confirmDelete}
        disabled={busy !== null}
      />
    </View>
  );
}

export default function ProfileScreen() {
  const units = useSettingsStore((s) => s.units);
  const batchRadius = useSettingsStore((s) => s.batch_import_radius);
  const { setUnits, setBatchImportRadius } = useSettingsActions();
  const userId = useAuthStore((s) => s.userId);

  // D23: the radius is stored in metres; the field shows it in the user's unit. `typed` holds the text only while
  // the user is typing, so a units switch or a store update re-renders the field from the stored metres.
  const [typed, setTyped] = useState<string | null>(null);
  const radiusText = typed ?? String(radiusToDisplay(batchRadius, units));

  const commitRadius = () => {
    if (typed === null) return;
    setTyped(null);
    const radiusMeters = radiusFromInput(typed, units);
    if (radiusMeters !== null && radiusMeters !== batchRadius) setBatchImportRadius(radiusMeters);
  };

  // Taps keep the keyboard up (keyboardShouldPersistTaps), so text typed in one unit is saved before the switch.
  const switchUnits = (next: UnitSystem) => {
    commitRadius();
    setUnits(next);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <SectionHeader title="Account" />
      {/* A new account (or none) starts with a fresh section: no error or busy state from the one before. */}
      <AccountSection key={userId ?? 'signed-out'} />

      <SectionHeader title="Units" />
      <View style={styles.unitsRow}>
        <Pressable
          style={[styles.unitButton, units === UnitSystem.Imperial && styles.unitButtonActive]}
          onPress={() => switchUnits(UnitSystem.Imperial)}
          accessibilityRole="button"
          accessibilityState={{ selected: units === UnitSystem.Imperial }}>
          <Text
            style={[styles.unitText, units === UnitSystem.Imperial && styles.unitTextActive]}>
            Imperial
          </Text>
        </Pressable>
        <Pressable
          style={[styles.unitButton, units === UnitSystem.Metric && styles.unitButtonActive]}
          onPress={() => switchUnits(UnitSystem.Metric)}
          accessibilityRole="button"
          accessibilityState={{ selected: units === UnitSystem.Metric }}>
          <Text
            style={[styles.unitText, units === UnitSystem.Metric && styles.unitTextActive]}>
            Metric
          </Text>
        </Pressable>
      </View>

      <SectionHeader title="Import Settings" />
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Import radius · {radiusUnitLabel(units)}</Text>
        <Text style={styles.fieldHint}>
          Photos this close together import as one spot, and a new spot this close to one you have offers to join it.
        </Text>
        <TextInput
          style={styles.input}
          value={radiusText}
          onChangeText={setTyped}
          onBlur={commitRadius}
          keyboardType="number-pad"
          returnKeyType="done"
          onSubmitEditing={commitRadius}
          accessibilityLabel={units === UnitSystem.Imperial ? 'Import radius in feet' : 'Import radius in metres'}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
    gap: spacing.md,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.gray[900],
    marginTop: spacing.lg,
  },
  account: {
    gap: spacing.sm,
  },
  accountTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: palette.gray[900],
  },
  accountBody: {
    fontSize: 15,
    color: palette.gray[700],
  },
  backup: {
    gap: spacing.xs,
  },
  backupFailed: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  backupFailedText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: palette.red[700],
  },
  unitsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  unitButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: palette.gray[300],
    alignItems: 'center',
    backgroundColor: palette.white,
  },
  unitButtonActive: {
    borderColor: palette.blue[500],
    backgroundColor: palette.blue[500] + '15',
  },
  unitText: {
    fontSize: 15,
    fontWeight: '500',
    color: palette.gray[600],
  },
  unitTextActive: {
    color: palette.blue[500],
    fontWeight: '600',
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: palette.gray[700],
  },
  fieldHint: {
    fontSize: 13,
    color: palette.gray[500],
  },
  input: {
    borderWidth: 1,
    borderColor: palette.gray[300],
    borderRadius: radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: palette.gray[900],
    backgroundColor: palette.white,
    width: 100,
  },
});
