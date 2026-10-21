import { useCallback } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { StyleSheet, ScrollView, View, Text, Pressable } from 'react-native';
import { Image, type ImageProps } from 'expo-image';

import { useSpotsStore, useMediaStore } from '@/src/stores';
import { useSettingsStore } from '@/src/stores/settings-store';
import { featureLabel, getSpotDisplayName } from '@/src/utils/spot-name';
import { resolvePhotoUri } from '@/src/utils/photo-storage';
import { spotPhotos } from '@/src/utils/spot-photos';
import { displayLength } from '@/src/utils/units';
import { RatingBadge } from '@/src/components/RatingBadge';
import { StarRating } from '@/src/components/StarRating';
import { palette, spacing, radius } from '@/src/constants/theme';
import { STOP_TYPE_LABELS } from '@/src/constants/labels';
import type { Media, Spot } from '@/src/types';

function Photo({ media, style, testID }: { media: Media; style: ImageProps['style']; testID: string }) {
  return (
    <Image testID={testID} source={{ uri: resolvePhotoUri(media.file_path) }} style={style} contentFit="cover" />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string | undefined }) {
  return value ? (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  ) : null;
}

export default function SpotDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const spot = useSpotsStore((s) => s.spots.find((sp) => sp.id === id));
  const units = useSettingsStore((s) => s.units);
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

        <View style={styles.headerRow}>
          <Text style={styles.title}>{displayName}</Text>
        </View>

        {/* Feature Details */}
        {hasFeatureDetails(spot) ? (
          <Section title="Feature">
            <InfoRow label="Type" value={featureLabel(spot)} />
            <InfoRow label="Shape" value={spot.feature.shape} />
            {spot.feature.dimensions?.length != null ? (
              <InfoRow label="Length" value={displayLength(spot.feature.dimensions.length, units)} />
            ) : null}
            {spot.feature.dimensions?.height != null ? (
              <InfoRow label="Height" value={displayLength(spot.feature.dimensions.height, units)} />
            ) : null}
            {spot.feature.dimensions?.width != null ? (
              <InfoRow label="Width" value={displayLength(spot.feature.dimensions.width, units)} />
            ) : null}
            <InfoRow label="Material" value={spot.feature.material?.replace(/_/g, ' ')} />
            {spot.feature.difficulty != null ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Difficulty</Text>
                <RatingBadge rating={spot.feature.difficulty as 1 | 2 | 3 | 4 | 5} />
              </View>
            ) : null}
            {spot.feature.skate_stops?.is_stopped ? (
              <>
                <InfoRow label="Stop Type" value={spot.feature.skate_stops.stop_type ? STOP_TYPE_LABELS[spot.feature.skate_stops.stop_type] : undefined} />
                <InfoRow label="Stop Details" value={spot.feature.skate_stops.stop_description} />
                <InfoRow label="Removable" value={spot.feature.skate_stops.removable ? 'Yes' : 'No'} />
              </>
            ) : null}
          </Section>
        ) : null}

        {/* In-Run */}
        {hasInRunDetails(spot) ? (
          <Section title="In-Run">
            {spot.in_run.natural_speed != null ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Natural Speed</Text>
                <StarRating value={spot.in_run.natural_speed} readonly size={18} />
              </View>
            ) : null}
          </Section>
        ) : null}

        {/* Landing */}
        {hasLandingDetails(spot) ? (
          <Section title="Landing">
            {spot.landing.difficulty != null ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Difficulty</Text>
                <RatingBadge rating={spot.landing.difficulty as 1 | 2 | 3 | 4 | 5} />
              </View>
            ) : null}
            <InfoRow label="Surface" value={spot.landing.surface?.replace(/_/g, ' ')} />
          </Section>
        ) : null}

        {/* Metadata */}
        {hasMetadata(spot) ? (
          <Section title="Details">
            {spot.metadata.intensity != null ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Intensity</Text>
                <StarRating value={spot.metadata.intensity} readonly size={18} />
              </View>
            ) : null}
            {spot.metadata.bustability != null ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Bustability</Text>
                <StarRating value={spot.metadata.bustability} readonly size={18} />
              </View>
            ) : null}
            <InfoRow label="Bust Notes" value={spot.metadata.bustability_notes} />
            <InfoRow label="Notes" value={spot.metadata.notes} />
          </Section>
        ) : null}
      </ScrollView>
    </>
  );
}

function hasFeatureDetails(spot: Spot): boolean {
  return !!(spot.feature.type || spot.feature.shape || spot.feature.dimensions || spot.feature.material || spot.feature.difficulty != null || spot.feature.skate_stops?.is_stopped);
}

function hasInRunDetails(spot: Spot): boolean {
  return spot.in_run.natural_speed != null;
}

function hasLandingDetails(spot: Spot): boolean {
  return !!(spot.landing.difficulty != null || spot.landing.surface);
}

function hasMetadata(spot: Spot): boolean {
  return !!(spot.metadata.intensity != null || spot.metadata.bustability != null || spot.metadata.notes);
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: palette.gray[900],
    flex: 1,
  },
  editButton: {
    fontSize: 17,
    color: palette.blue[500],
    fontWeight: '600',
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.gray[900],
    marginBottom: spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  infoLabel: {
    fontSize: 15,
    color: palette.gray[500],
  },
  infoValue: {
    fontSize: 15,
    color: palette.gray[900],
    fontWeight: '500',
    textTransform: 'capitalize',
  },
});
