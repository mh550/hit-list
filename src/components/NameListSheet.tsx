import { useRef, useState } from 'react';
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

function NameListSheetContent({ onCancel, onSubmit, ...card }: Omit<Props, 'visible'>) {
  const { submitting, submit, cancel } = useGuardedSubmit(onSubmit, onCancel);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={cancel} testID="name-list-sheet-modal">
      <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={cancel} accessible={false} />
        <NameListCard {...card} submitting={submitting} onCancel={cancel} onSubmit={submit} />
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Runs one submit at a time (a second tap can land before the disabled state renders) and turns cancel into a no-op
 * while one runs: closing mid-submit would let the caller act (navigate, alert) for a sheet the user already
 * dismissed. A rejection is swallowed: the caller reports it, the sheet just lets the user try again.
 */
export function useGuardedSubmit(onSubmit: Props['onSubmit'], onCancel: () => void) {
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const cancel = () => {
    if (!inFlight.current) onCancel();
  };
  const submit = async (name: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    try {
      await onSubmit(name);
    } catch {
      // Reported by the caller.
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };
  return { submitting, submit, cancel };
}

interface CardProps {
  title: string;
  initialName?: string;
  confirmLabel: string;
  /** Disables both buttons while a submit runs (useGuardedSubmit). */
  submitting: boolean;
  onCancel: () => void;
  /** Gets the trimmed, non-empty name. */
  onSubmit: (name: string) => void;
}

/** The sheet's card alone, for a screen that shows it inside its own Modal (one Modal at a time on iOS). */
export function NameListCard({ title, initialName = '', confirmLabel, submitting, onCancel, onSubmit }: CardProps) {
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();
  const submit = () => {
    if (trimmed !== '') onSubmit(trimmed);
  };

  return (
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
        <Button title="Cancel" variant="secondary" onPress={onCancel} disabled={submitting} />
        <Button title={confirmLabel} onPress={submit} disabled={trimmed === '' || submitting} />
      </View>
    </View>
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
