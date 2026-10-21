import { useCallback } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { StyleSheet, ScrollView, View, Text, Pressable } from 'react-native';
import { Image, type ImageProps } from 'expo-image';

import { useSpotsStore, useMediaStore } from '@/src/stores';
import { getSpotDisplayName } from '@/src/utils/spot-name';
import { resolvePhotoUri } from '@/src/utils/photo-storage';
import { spotPhotos } from '@/src/utils/spot-photos';
import { palette, spacing, radius } from '@/src/constants/theme';
import type { Media } from '@/src/types';

function Photo({ media, style, testID }: { media: Media; style: ImageProps['style']; testID: string }) {
  return (
    <Image testID={testID} source={{ uri: resolvePhotoUri(media.file_path) }} style={style} contentFit="cover" />
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

  if (!spot) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Spot not found</Text>
      </View>
    );
  }

  const displayName = getSpotDisplayName(spot);
  const [hero, ...rest] = spotPhotos(spot, media);

  return (
    <>
      <Stack.Screen
        options={{
          title: displayName,
          headerRight: () => (
            <Pressable onPress={handleEdit} hitSlop={8}>
              <Text style={styles.editButton}>Edit</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        contentInsetAdjustmentBehavior="automatic">
        {/* Photo Gallery: primary photo as hero, the rest in capture order */}
        {hero ? <Photo media={hero} style={styles.heroImage} testID="spot-photo-0" /> : null}
        {rest.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.galleryRow}>
            {rest.map((m, i) => (
              <Photo key={m.id} media={m} style={styles.galleryThumb} testID={`spot-photo-${i + 1}`} />
            ))}
          </ScrollView>
        ) : null}

        <Text style={styles.title}>{displayName}</Text>

        {spot.notes ? (
          <View style={styles.notes}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{spot.notes}</Text>
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: spacing['3xl'],
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
  heroImage: {
    width: '100%',
    height: 240,
  },
  galleryRow: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  galleryThumb: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    marginRight: spacing.sm,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: palette.gray[900],
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  editButton: {
    fontSize: 17,
    color: palette.blue[500],
    fontWeight: '600',
  },
  notes: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.xs,
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
});
