import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AccountsNotSetUp, AuthError, AuthScreen, Button, FormInput } from '@/src/components';
import { palette, spacing, typography } from '@/src/constants/theme';
import { useAuthStore } from '@/src/stores/auth-store';
import { getSupabase } from '@/src/sync/client';
import { saveProfile } from '@/src/sync/auth';
import { normalizeUsername, validateUsername } from '@/src/utils/username';

/** The server's display-name limit (D58). */
const DISPLAY_NAME_MAX = 50;

// Onboarding after the first sign-in: an @username (required, D39) and a display name (optional, D63). The Stack
// gives it no back button and no swipe, and the tabs redirect here while the account is 'needs_username'.
export default function UsernameScreen() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.userId);
  const setProfile = useAuthStore((s) => s.setProfile);
  const [text, setText] = useState('');
  // No message before the first keystroke.
  const [touched, setTouched] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A second tap can land before the disabled state renders.
  const inFlight = useRef(false);

  const client = getSupabase();
  if (!client) return <AccountsNotSetUp />;
  if (!userId) {
    return (
      <AuthScreen>
        <Text style={styles.body}>Sign in first to pick a username.</Text>
        <Button title="Sign in" size="lg" onPress={() => router.replace('/auth/sign-in')} />
      </AuthScreen>
    );
  }

  const invalid = validateUsername(text);
  const canSave = !saving && !invalid;

  const changeText = (next: string) => {
    // The field already shows the '@'.
    setText(next.replace(/^\s*@+/, ''));
    setTouched(true);
    setError(null);
  };

  const save = async () => {
    if (inFlight.current || invalid) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    const username = normalizeUsername(text);
    const name = displayName.trim() || null;
    const result = await saveProfile(client, userId, username, name);
    inFlight.current = false;
    setSaving(false);
    if (result === 'saved') {
      setProfile(username, name);
      router.replace('/(tabs)/profile');
    } else {
      setError(result === 'taken' ? 'That username is taken' : "Couldn't save. Try again.");
    }
  };
  const submit = () => {
    if (canSave) void save();
  };

  return (
    <AuthScreen>
      <Text style={styles.heading} accessibilityRole="header">
        Pick your @username
      </Text>
      <View style={styles.usernameRow}>
        <Text style={styles.at} accessibilityElementsHidden importantForAccessibility="no">
          @
        </Text>
        <View style={styles.usernameField}>
          <FormInput
            value={text}
            onChangeText={changeText}
            accessibilityLabel="Username"
            placeholder="username"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username-new"
            textContentType="username"
            returnKeyType="next"
            autoFocus
            onSubmitEditing={submit}
          />
        </View>
      </View>
      {touched && invalid ? (
        <Text style={styles.hint} accessibilityLiveRegion="polite">
          {invalid}
        </Text>
      ) : null}
      <FormInput
        label="Display name"
        hideLabel
        value={displayName}
        onChangeText={setDisplayName}
        accessibilityLabel="Display name"
        placeholder="Ana B"
        maxLength={DISPLAY_NAME_MAX}
        autoCapitalize="words"
        textContentType="nickname"
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <Text style={styles.hint}>Optional. Shown to friends.</Text>
      <AuthError message={error} />
      <Button title={saving ? 'Saving…' : 'Done'} size="lg" onPress={submit} disabled={!canSave} />
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
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  at: {
    ...typography.title3,
    color: palette.gray[500],
  },
  usernameField: {
    flex: 1,
  },
  hint: {
    ...typography.subheadline,
    color: palette.gray[500],
  },
});
