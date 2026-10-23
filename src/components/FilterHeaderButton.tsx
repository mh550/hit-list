import { HeaderTextButton } from './HeaderTextButton';
import { selectActiveFilterCount, useSpotsStore } from '@/src/stores';

/** The header's 'Filter' button: 'Filter (2)', bold, while the shared filters (D52) have any set. */
export function FilterHeaderButton({ onPress }: { onPress: () => void }) {
  const count = useSpotsStore((s) => selectActiveFilterCount(s.filters));
  return (
    <HeaderTextButton
      onPress={onPress}
      accessibilityLabel={`Filter spots${count > 0 ? `, ${count} active` : ''}`}
      emphasized={count > 0}>
      {`Filter${count > 0 ? ` (${count})` : ''}`}
    </HeaderTextButton>
  );
}
