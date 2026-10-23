import { StyleSheet, Text, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { palette } from '@/src/constants/theme';
import type { HitList } from '@/src/types';
import { isShared, memberCount } from '@/src/utils/members';

/** 'Shared with 4' for a shared list (D84 count), for the label of the row or chip that holds the badge; else none. */
export function sharedLabel(list: Pick<HitList, 'shared' | 'members'>): string | undefined {
  return isShared(list) ? `Shared with ${memberCount(list)}` : undefined;
}

/**
 * The two-people icon and the member count (D84) wherever a shared list appears (S8, §1): Lists tab rows, the list
 * picker, the detail's 'In lists' chips, the Add-to-list sheet. Nothing for a private list. The row or chip holding it
 * says `sharedLabel` to VoiceOver.
 */
export function SharedBadge({
  list,
  color = palette.gray[500],
}: {
  list: Pick<HitList, 'shared' | 'members'>;
  color?: string;
}) {
  if (!isShared(list)) return null;
  return (
    <View style={styles.badge} accessibilityLabel={sharedLabel(list)}>
      <IconSymbol name="person.2.fill" size={14} color={color} />
      <Text style={[styles.count, { color }]}>{String(memberCount(list))}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  count: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
