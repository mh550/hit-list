import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AccountsNotSetUp, AuthError, AuthScreen, Button, FormInput } from '@/src/components';
import { palette, spacing, typography } from '@/src/constants/theme';
import { useAuthStore } from '@/src/stores/auth-store';
import { getSupabase } from '@/src/sync/client';
import { sendSignInCode, verifySignInCode } from '@/src/sync/auth';

const CODE_LENGTH = 6;
/** How long 'Sent' shows after a resend. */
const SENT_MS = 3000;

// Sign in step two: the 6-digit code from the email. Six digits submit on their own, once; a rider with no
// @username yet goes on to pick one, anyone else goes back to the tab that opened sign-in.
export default function CodeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = typeof params.email === 'string' ? params.email : '';
  const setAuth = useAuthStore((s) => s.setAuth);
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Verifying spends the code: a second submit (a re-typed or re-rendered six) would fail after a success.
  const verifying = useRef(false);

  useEffect(() => {
    if (!sent) return;
    const timer = setTimeout(() => setSent(false), SENT_MS);
    return () => clearTimeout(timer);
  }, [sent]);

  const client = getSupabase();
  if (!client) return <AccountsNotSetUp />;

  const verify = async (token: string) => {
    if (verifying.current) return;
    verifying.current = true;
    setChecking(true);
    setError(null);
    const account = await verifySignInCode(client, email, token);
    if (!account) {
      verifying.current = false;
      setChecking(false);
      setCode('');
      setError("That code didn't work. Try again or resend.");
      return;
    }
    // Stays 'verifying' after a success: the screen is leaving.
    setAuth(account);
    if (account.status === 'needs_username') router.replace('/auth/username');
    else router.dismissAll();
  };

  // Digits only, so a pasted '123 456' is 123456.
  const changeCode = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) void verify(digits);
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    const message = await sendSignInCode(client, email);
    setResending(false);
    if (message) setError(message);
    else setSent(true);
  };

  return (
    <AuthScreen>
      <Text style={styles.body}>{`Enter the code we sent to ${email}`}</Text>
      <FormInput
        value={code}
        onChangeText={changeCode}
        accessibilityLabel="Code"
        placeholder="123456"
        keyboardType="number-pad"
        maxLength={CODE_LENGTH}
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus
        editable={!checking}
        style={styles.code}
      />
      {checking ? <Text style={styles.status}>Checking…</Text> : null}
      <AuthError message={error} />
      <View style={styles.actions}>
        <Button
          title={sent ? 'Sent' : resending ? 'Sending…' : 'Resend code'}
          variant="ghost"
          onPress={() => void resend()}
          disabled={sent || resending || checking}
        />
        <Button title="Use a different email" variant="ghost" onPress={() => router.back()} disabled={checking} />
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    ...typography.body,
    color: palette.gray[700],
  },
  code: {
    fontSize: 28,
    letterSpacing: 8,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  status: {
    ...typography.subheadline,
    color: palette.gray[500],
  },
  actions: {
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
});
