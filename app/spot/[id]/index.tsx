import { useCallback } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { StyleSheet, ScrollView, View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';

import { useSpotsStore, useMediaStore } from '@/src/stores';
import { useSettingsStore } from '@/src/stores/settings-store';
import { getSpotDisplayName } from '@/src/utils/spot-name';
import { resolvePhotoUri } from '@/src/utils/photo-storage';
import { spotPhotos } from '@/src/utils/spot-photos';
import { displayLength } from '@/src/utils/units';
import { RatingBadge } from '@/src/components/RatingBadge';
import { StarRating } from '@/src/components/StarRating';
import { palette, spacing, radius } from '@/src/constants/theme';
import { SpotStatus } from '@/src/types';
import type { Spot, SetupOption } from '@/src/types';

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

function SetupOptionCard({ option, index }: { option: SetupOption; index: number }) {
  if (option.requires.length === 0) {
    return (
      <View style={styles.setupCard}>
        <Text style={styles.setupTitle}>Option {index + 1}</Text>
        <Text style={styles.setupItem}>No equipment needed (natural speed)</Text>
      </View>
    );
  }

  return (
    <View style={styles.setupCard}>
      <Text style={styles.setupTitle}>Option {index + 1}</Text>
      {option.requires.map((req, i) => (
        <View key={`${req.item}-${i}`} style={styles.setupReqRow}>
          <View style={[styles.categoryTag, req.category === 'gear' ? styles.gearTag : styles.buildTag]}>
            <Text style={styles.categoryText}>{req.category}</Text>
          </View>
          <Text style={styles.setupItem}>
            {req.item.replace(/_/g, ' ')}
            {req.quantity && req.quantity > 1 ? ` x${req.quantity}` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
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
        {hero ? (
          <Image
            testID="spot-photo-0"
            source={{ uri: resolvePhotoUri(hero.file_path) }}
            style={styles.heroImage}
            contentFit="cover"
          />
        ) : null}
        {rest.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.galleryRow}>
            {rest.map((m, i) => (
              <Image
                key={m.id}
                testID={`spot-photo-${i + 1}`}
                source={{ uri: resolvePhotoUri(m.file_path) }}
                style={styles.galleryThumb}
                contentFit="cover"
              />
            ))}
          </ScrollView>
        ) : null}

        {/* Status */}
        <View style={styles.headerRow}>
          <Text style={styles.title}>{displayName}</Text>
          {spot.status === SpotStatus.Draft ? (
            <View style={styles.draftBadge}>
              <Text style={styles.draftText}>Draft</Text>
            </View>
          ) : null}
        </View>

        {/* Feature Details */}
        {hasFeatureDetails(spot) ? (
          <Section title="Feature">
            <InfoRow label="Type" value={formatType(spot)} />
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
                <InfoRow label="Stop Type" value={spot.feature.skate_stops.stop_type?.replace(/_/g, ' ')} />
                <InfoRow label="Stop Info" value={spot.feature.skate_stops.stop_description} />
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
            {spot.in_run.setup_options.length > 0 ? (
              <View style={styles.setupOptions}>
                <Text style={styles.setupLabel}>Setup Options</Text>
                {spot.in_run.setup_options.map((opt, i) => (
                  <SetupOptionCard key={i} option={opt} index={i} />
                ))}
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
  return !!(spot.feature.type || spot.feature.shape || spot.feature.dimensions || spot.feature.material || spot.feature.difficulty != null);
}

function hasInRunDetails(spot: Spot): boolean {
  return !!(spot.in_run.natural_speed != null || spot.in_run.setup_options.length > 0);
}

function hasLandingDetails(spot: Spot): boolean {
  return !!(spot.landing.difficulty != null || spot.landing.surface);
}

function hasMetadata(spot: Spot): boolean {
  return !!(spot.metadata.intensity != null || spot.metadata.bustability != null || spot.metadata.notes);
}

function formatType(spot: Spot): string | undefined {
  if (!spot.feature.type) return undefined;
  if (spot.feature.type === 'other' && spot.feature.custom_type) return spot.feature.custom_type;
  return spot.feature.type.replace(/_/g, ' ');
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
  draftBadge: {
    backgroundColor: palette.yellow[100],
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
  },
  draftText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.yellow[700],
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
  setupOptions: {
    gap: spacing.sm,
  },
  setupLabel: {
    fontSize: 15,
    color: palette.gray[500],
    marginBottom: spacing.xs,
  },
  setupCard: {
    backgroundColor: palette.gray[50],
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: spacing.md,
    gap: spacing.xs,
  },
  setupTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.gray[700],
  },
  setupReqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  categoryTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
  },
  gearTag: {
    backgroundColor: palette.blue[500] + '20',
  },
  buildTag: {
    backgroundColor: palette.yellow[500] + '20',
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: palette.gray[600],
  },
  setupItem: {
    fontSize: 14,
    color: palette.gray[700],
    textTransform: 'capitalize',
  },
});
