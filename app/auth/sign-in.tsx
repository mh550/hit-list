import { useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';

import { AccountsNotSetUp, AuthError, AuthScreen, Button, FormInput } from '@/src/components';
import { palette, typography } from '@/src/constants/theme';
import { getSupabase } from '@/src/sync/client';
import { sendSignInCode } from '@/src/sync/auth';

// Sign in step one: the rider's email; Supabase emails a 6-digit code (no password), then the code screen.
export default function SignInScreen() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A second tap can land before the disabled state renders.
  const inFlight = useRef(false);

  const client = getSupabase();
  if (!client) return <AccountsNotSetUp />;
  const canSend = !sending && text.trim().includes('@');

  const send = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setError(null);
    const email = text.trim().toLowerCase();
    const message = await sendSignInCode(client, email);
    inFlight.current = false;
    setSending(false);
    if (message) setError(message);
    else router.push({ pathname: '/auth/code', params: { email } });
  };

  return (
    <AuthScreen>
      <Text style={styles.heading} accessibilityRole="header">
        Sign in to HitList
      </Text>
      <Text style={styles.body}>We&apos;ll email you a 6-digit code. No password.</Text>
      <FormInput
        value={text}
        onChangeText={setText}
        accessibilityLabel="Email"
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={() => {
          if (canSend) void send();
        }}
      />
      <AuthError message={error} />
      <Button
        title={sending ? 'Sending…' : 'Send code'}
        size="lg"
        onPress={() => void send()}
        disabled={!canSend}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  heading: {
    ...typography.title2,
    color: palette.gray[900],
  },
  body: {
    ...typography.body,
    color: palette.gray[600],
  },
});
