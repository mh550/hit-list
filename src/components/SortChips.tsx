import { ScrollView, StyleSheet } from 'react-native';

import { Chip } from '@/src/components/Chip';
import { spacing } from '@/src/constants/theme';
import { SortDirection, SortField } from '@/src/types';

interface SortChipsProps {
  sortField: SortField;
  sortDirection: SortDirection;
  /** Distance needs a known position; without one its chip is disabled. */
  hasLocation: boolean;
  onSort: (field: SortField, direction: SortDirection) => void;
}

// D10: Distance first. Each option has its label, its natural first direction (nearest first, newest
// first, A to Z, most intense first) and how VoiceOver says each direction.
const SORT_OPTIONS: {
  field: SortField;
  label: string;
  first: SortDirection;
  spoken: Record<SortDirection, string>;
}[] = [
  {
    field: SortField.Distance,
    label: 'Distance',
    first: SortDirection.Asc,
    spoken: { [SortDirection.Asc]: 'nearest first', [SortDirection.Desc]: 'farthest first' },
  },
  {
    field: SortField.DateAdded,
    label: 'Date',
    first: SortDirection.Desc,
    spoken: { [SortDirection.Asc]: 'oldest first', [SortDirection.Desc]: 'newest first' },
  },
  {
    field: SortField.Name,
    label: 'Name',
    first: SortDirection.Asc,
    spoken: { [SortDirection.Asc]: 'A to Z', [SortDirection.Desc]: 'Z to A' },
  },
  {
    field: SortField.Intensity,
    label: 'Intensity',
    first: SortDirection.Desc,
    spoken: { [SortDirection.Asc]: 'lowest first', [SortDirection.Desc]: 'highest first' },
  },
];

function flip(direction: SortDirection): SortDirection {
  return direction === SortDirection.Asc ? SortDirection.Desc : SortDirection.Asc;
}

/** The list's sort row: tap a chip to sort by it, tap the active one again to reverse it. */
export function SortChips({ sortField, sortDirection, hasLocation, onSort }: SortChipsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={styles.scroll}
      contentContainerStyle={styles.row}>
      {SORT_OPTIONS.map(({ field, label, first, spoken }) => {
        const selected = field === sortField;
        const disabled = field === SortField.Distance && !hasLocation;
        const arrow = sortDirection === SortDirection.Asc ? '↑' : '↓';
        return (
          <Chip
            key={field}
            role="button"
            label={selected ? `${label} ${arrow}` : label}
            accessibilityLabel={selected ? `Sort by ${label}, ${spoken[sortDirection]}` : `Sort by ${label}`}
            accessibilityHint={disabled ? 'Needs your location' : selected ? 'Double-tap to reverse' : undefined}
            selected={selected}
            disabled={disabled}
            onPress={() => onSort(field, selected ? flip(sortDirection) : first)}
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // A horizontal ScrollView defaults to flexGrow 1 / flexShrink 1 and would take half the screen's height.
  scroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  row: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
});
