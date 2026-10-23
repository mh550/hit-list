import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StyleSheet, ScrollView, View, Text, Pressable } from 'react-native';

import { getSpotLegacy, type SpotLegacy } from '@/src/db';
import { useSpotsStore, useMediaStore, useSettingsStore, useHitListsStore, selectSpotLists } from '@/src/stores';
import { AddPhotosTile, AddToListSheet, Chip, ChipGroup, PhotoGrid, SpeedScale, Tag } from '@/src/components';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FEATURE_TYPE_LABELS } from '@/src/constants/labels';
import { getSpotDisplayName } from '@/src/utils/spot-name';
import { spotPhotos } from '@/src/utils/spot-photos';
import { formatLegacyDetails } from '@/src/utils/legacy-details';
import { palette, spacing } from '@/src/constants/theme';

/**
 * What the old nested model held for this spot (legacy_json), read once per mount. Collapsed by default and absent
 * when the archive is missing, empty or unreadable.
 */
function OlderDetails({ spotId }: { spotId: string }) {
  const db = useSQLiteContext();
  const units = useSettingsStore((s) => s.units);
  const [legacy, setLegacy] = useState<SpotLegacy | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    getSpotLegacy(db, spotId)
      .then((l) => {
        if (live) setLegacy(l);
      })
      .catch((e: unknown) => {
        if (live) console.warn('Older details unreadable', spotId, e);
      });
    return () => {
      live = false;
    };
  }, [db, spotId]);

  const rows = legacy ? formatLegacyDetails(legacy, units) : [];
  if (rows.length === 0) return null;

  return (
    <View style={styles.older}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={styles.olderHeader}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}>
        <Text style={styles.olderTitle}>Older details</Text>
        <IconSymbol name={open ? 'chevron.down' : 'chevron.right'} size={14} color={palette.gray[500]} />
      </Pressable>
      {open
        ? rows.map((row, i) => (
            <View key={`${i}-${row.label}`} style={styles.olderRow}>
              <Text style={styles.olderLabel}>{row.label}</Text>
              <Text style={styles.olderValue}>{row.value}</Text>
            </View>
          ))
        : null}
    </View>
  );
}

/** 'In lists': a chip per list the spot is in (opens it), then '+ Add to hit list', which files it from here. */
function InLists({ spotId }: { spotId: string }) {
  const router = useRouter();
  const lists = useHitListsStore((s) => s.lists);
  const membershipBySpot = useHitListsStore((s) => s.membershipBySpot);
  const inLists = useMemo(() => selectSpotLists(spotId, lists, membershipBySpot), [spotId, lists, membershipBySpot]);
  const spotIds = useMemo(() => [spotId], [spotId]);
  const [adding, setAdding] = useState(false);

  return (
    <View style={styles.inLists}>
      <Text style={styles.inListsLabel}>In lists</Text>
      <ChipGroup>
        {inLists.map((list) => (
          <Chip
            key={list.id}
            label={list.name}
            role="button"
            onPress={() => router.push(`/list/${list.id}` as `/list/${string}`)}
          />
        ))}
        <Chip label="+ Add to hit list" role="button" accessibilityLabel="Add to hit list" onPress={() => setAdding(true)} />
      </ChipGroup>
      <AddToListSheet visible={adding} spotIds={spotIds} onClose={() => setAdding(false)} />
    </View>
  );
}

export default function SpotDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const spot = useSpotsStore((s) => s.spots.find((sp) => sp.id === id));
  const media = useMediaStore((s) => (id ? s.mediaBySpot[id] : undefined));

  const handleEdit = useCallback(() => {
    router.push(`/spot/${id}/edit` as `/spot/${string}/edit`);
  }, [router, id]);

  const handlePressPhoto = useCallback(
    (index: number) => router.push(`/spot/${id}/photos?index=${index}` as `/spot/${string}/photos`),
    [router, id],
  );

  if (!spot) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Spot not found</Text>
      </View>
    );
  }

  const displayName = getSpotDisplayName(spot);
  const photos = spotPhotos(spot, media);
  const hasTags = spot.feature_types.length > 0 || spot.stopped;

  return (
    <>
      <Stack.Screen
        options={{
          title: displayName,
          headerRight: () => (
            <Pressable onPress={handleEdit} hitSlop={8} accessibilityRole="button">
              <Text style={styles.editButton}>Edit</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic">
        <PhotoGrid
          photos={photos}
          onPressPhoto={handlePressPhoto}
          trailing={photos.length === 0 ? <AddPhotosTile onPress={handleEdit} /> : undefined}
        />

        <Text style={styles.title}>{displayName}</Text>

        {hasTags ? (
          <ChipGroup>
            {spot.feature_types.map((type) => (
              <Tag key={type} label={FEATURE_TYPE_LABELS[type]} />
            ))}
            {spot.stopped ? <Tag label="Skate stopped" tone="stopped" testID="tag-stopped" /> : null}
          </ChipGroup>
        ) : null}

        <InLists spotId={spot.id} />

        <SpeedScale readonly value={spot.natural_speed} />

        {spot.notes ? (
          <View style={styles.notes}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{spot.notes}</Text>
          </View>
        ) : null}

        <OlderDetails key={spot.id} spotId={spot.id} />
      </ScrollView>
    </>
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: palette.gray[500],
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: palette.gray[900],
  },
  editButton: {
    fontSize: 17,
    color: palette.blue[500],
    fontWeight: '600',
  },
  notes: {
    gap: spacing.xs,
  },
  inLists: {
    gap: spacing.sm,
  },
  inListsLabel: {
    fontSize: 15,
    color: palette.gray[500],
  },
  notesLabel: {
    fontSize: 15,
    color: palette.gray[500],
  },
  notesText: {
    fontSize: 16,
    lineHeight: 22,
    color: palette.gray[900],
  },
  older: {
    gap: spacing.sm,
  },
  olderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
  },
  olderTitle: {
    fontSize: 15,
    color: palette.gray[500],
  },
  olderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  olderLabel: {
    fontSize: 15,
    color: palette.gray[500],
  },
  olderValue: {
    flexShrink: 1,
    fontSize: 15,
    color: palette.gray[900],
    textAlign: 'right',
  },
});
