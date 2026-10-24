import React, { useEffect } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View } from 'react-native';

import { palette, spacing, typography } from '@/src/constants/theme';

/** The page the app/auth/* screens share: a scrolling column that keeps the keyboard up for taps. */
export function AuthScreen({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive">
      {children}
    </ScrollView>
  );
}

/** What a build without Supabase values (§3.1) says where an account would be: the auth screens and Profile. */
export const ACCOUNTS_NOT_SET_UP = "Accounts aren't set up in this build";

/** A build without Supabase values: the auth screens show this line and nothing else. */
export function AccountsNotSetUp() {
  return (
    <View style={styles.notSetUp}>
      <Text style={styles.notSetUpText}>{ACCOUNTS_NOT_SET_UP}</Text>
    </View>
  );
}

/** An error shown in place under a form and announced; `message` is a string, never an error object. */
export function AuthError({ message }: { message: string | null }) {
  // VoiceOver reads neither the 'alert' role on a Text nor a live region (Android only): say it.
  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
  if (!message) return null;
  return (
    <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
      {message}
    </Text>
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
  notSetUp: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  notSetUpText: {
    ...typography.callout,
    color: palette.gray[500],
    textAlign: 'center',
  },
  error: {
    ...typography.subheadline,
    color: palette.red[700],
  },
});
