import { useRouter } from 'expo-router';
import { StyleSheet, View, Pressable, Text } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';

import { useSpotsStore } from '@/src/stores';
import { SpotsBrowser } from '@/src/components/SpotsBrowser';
import { palette, spacing } from '@/src/constants/theme';

// Floating action column (bottom-right): shared by its style and the list's bottom padding so the two
// cannot drift. The list pads past the column's full height so the last rows scroll clear of it.
const FAB_BOTTOM = 32;
const FAB_SIZE = 56;
const FAB_SECONDARY_SIZE = 44;
const FAB_GAP = spacing.md;
const LIST_BOTTOM_MARGIN = spacing.md;
const LIST_BOTTOM_PADDING = FAB_BOTTOM + FAB_SIZE + FAB_GAP + FAB_SECONDARY_SIZE + LIST_BOTTOM_MARGIN;

export default function SpotsScreen() {
  const router = useRouter();
  const spots = useSpotsStore((s) => s.spots);

  return (
    <View style={styles.container}>
      <SpotsBrowser
        spots={spots}
        emptyTitle="No Spots Yet"
        emptyMessage="Tap the + button to add your first spot, or import from your photos"
        emptyActionLabel="Add Spot"
        onEmptyAction={() => router.push('/add/camera')}
        contentBottomInset={LIST_BOTTOM_PADDING}
      />
      <View style={styles.fabColumn}>
        <Pressable
          style={[styles.fabShadow, styles.fabSecondary]}
          onPress={() => router.push('/import')}
          accessibilityLabel="Import photos"
          accessibilityRole="button">
          <IconSymbol name="photo.on.rectangle" size={22} color={palette.blue[500]} />
        </Pressable>
        <Pressable
          style={[styles.fabShadow, styles.fab]}
          onPress={() => router.push('/add/camera')}
          accessibilityLabel="Add new spot"
          accessibilityRole="button">
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Floating actions: the secondary "Import photos" button stacked above the "+" FAB (D12).
  fabColumn: {
    position: 'absolute',
    bottom: FAB_BOTTOM,
    right: 32,
    alignItems: 'center',
    gap: FAB_GAP,
  },
  fabShadow: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: palette.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: palette.blue[500],
  },
  fabSecondary: {
    width: FAB_SECONDARY_SIZE,
    height: FAB_SECONDARY_SIZE,
    borderRadius: FAB_SECONDARY_SIZE / 2,
    backgroundColor: palette.white,
  },
  fabText: {
    fontSize: 28,
    color: palette.white,
    fontWeight: '600',
  },
});
