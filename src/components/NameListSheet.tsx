import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { palette, radius, spacing } from '@/src/constants/theme';
import { Button } from './Button';

interface Props {
  visible: boolean;
  /** 'New hit list' or 'Rename list'. */
  title: string;
  /** Seeds the field on each open. */
  initialName?: string;
  /** 'Create' or 'Save'. */
  confirmLabel: string;
  onCancel: () => void;
  /** Gets the trimmed name. The sheet stays open (and enabled again) if it rejects; the caller closes it. */
  onSubmit: (name: string) => Promise<void> | void;
}

/** A small centred card that asks for a list's name. Mounted only while visible, so every open starts fresh. */
export function NameListSheet({ visible, ...rest }: Props) {
  if (!visible) return null;
  return <NameListSheetContent {...rest} />;
}

function NameListSheetContent({ title, initialName = '', confirmLabel, onCancel, onSubmit }: Omit<Props, 'visible'>) {
  const [name, setName] = useState(initialName);
  const [submitting, setSubmitting] = useState(false);
  // A second tap can land before the disabled state renders; the ref makes it a no-op.
  const inFlight = useRef(false);
  const trimmed = name.trim();
  // Closing mid-submit would let the caller act (navigate, alert) for a sheet the user already dismissed.
  const cancel = () => {
    if (!inFlight.current) onCancel();
  };

  const submit = async () => {
    if (trimmed === '' || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
    } catch {
      // The caller reports the failure; the sheet just lets the user try again.
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={cancel} testID="name-list-sheet-modal">
      <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={cancel} accessible={false} />
        <View style={styles.card}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Name"
            placeholderTextColor={palette.gray[400]}
            accessibilityLabel="List name"
            autoFocus
            returnKeyType="done"
            submitBehavior="submit"
            onSubmitEditing={submit}
          />
          <View style={styles.buttons}>
            <Button title="Cancel" variant="secondary" onPress={cancel} disabled={submitting} />
            <Button title={confirmLabel} onPress={submit} disabled={trimmed === '' || submitting} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  card: {
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.gray[900],
  },
  input: {
    borderWidth: 1,
    borderColor: palette.gray[300],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: palette.gray[900],
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
});
