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

// Display order, label and natural first direction: newest first, A to Z, nearest first, most intense first.
const SORT_OPTIONS: { field: SortField; label: string; first: SortDirection }[] = [
  { field: SortField.DateAdded, label: 'Date', first: SortDirection.Desc },
  { field: SortField.Name, label: 'Name', first: SortDirection.Asc },
  { field: SortField.Distance, label: 'Distance', first: SortDirection.Asc },
  { field: SortField.Intensity, label: 'Intensity', first: SortDirection.Desc },
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
      contentContainerStyle={styles.row}>
      {SORT_OPTIONS.map(({ field, label, first }) => {
        const selected = field === sortField;
        const disabled = field === SortField.Distance && !hasLocation;
        const arrow = sortDirection === SortDirection.Asc ? '↑' : '↓';
        return (
          <Chip
            key={field}
            role="button"
            label={selected ? `${label} ${arrow}` : label}
            accessibilityLabel={`Sort by ${label}`}
            selected={selected}
            disabled={disabled}
            onPress={() => {
              if (disabled) return;
              onSort(field, selected ? flip(sortDirection) : first);
            }}
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
});
