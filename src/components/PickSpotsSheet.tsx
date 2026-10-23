import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { palette, radius, spacing } from '@/src/constants/theme';
import { frozenSpotTitle, type FrozenSpot } from '@/src/utils/send-payload';
import { Button } from './Button';

/*
 * Inbox → Pick spots (S7-05, docs/plans/2026-10-22-s7-send.md "Inbox"): the frozen spots of one send, all checked;
 * Save hands the checked ids back (saving them finishes the send, D81). Mounted per open.
 */

interface Props {
  spots: FrozenSpot[];
  onSave: (spotIds: string[]) => void;
  onClose: () => void;
}

export function PickSpotsSheet({ spots, onSave, onClose }: Props) {
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set(spots.map((s) => s.id)));
  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  // in the send's order, whatever order they were checked in
  const picked = spots.filter((s) => checked.has(s.id)).map((s) => s.id);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Pick spots
          </Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {spots.map((spot) => {
            const on = checked.has(spot.id);
            const title = frozenSpotTitle(spot);
            return (
              <Pressable
                key={spot.id}
                onPress={() => toggle(spot.id)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                accessibilityRole="checkbox"
                accessibilityLabel={spot.generated_name ? `${title}, ${spot.generated_name}` : title}
                accessibilityState={{ checked: on }}>
                <View style={styles.rowLabel}>
                  <Text style={styles.rowText} numberOfLines={1}>
                    {title}
                  </Text>
                  {spot.generated_name ? (
                    <Text style={styles.rowHint} numberOfLines={1}>
                      {spot.generated_name}
                    </Text>
                  ) : null}
                </View>
                <View style={[styles.box, on && styles.boxChecked]}>
                  {on ? <IconSymbol name="checkmark" size={16} color={palette.white} /> : null}
                </View>
              </Pressable>
            );
          })}
          <View style={styles.save}>
            <Button title={`Save (${picked.length})`} onPress={() => onSave(picked)} disabled={picked.length === 0} />
          </View>
        </ScrollView>
      </View>
    </Modal>
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
  content: {
    paddingBottom: spacing['3xl'],
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
  save: {
    padding: spacing.lg,
  },
});
