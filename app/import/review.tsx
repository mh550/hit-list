import { useCallback, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { v4 as uuid } from 'uuid';
import { useSQLiteContext } from 'expo-sqlite';

import { useSpotActions } from '@/src/hooks/use-spot-actions';
import { insertMedia } from '@/src/db';
import { palette, spacing, radius } from '@/src/constants/theme';
import { SpotStatus } from '@/src/types';
import type { Spot, Media } from '@/src/types';
import type { ImportPhoto } from '@/src/utils/import-clustering';

interface SpotGroup {
  photos: ImportPhoto[];
  name: string;
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function ImportReviewScreen() {
  const { groupsJson } = useLocalSearchParams<{ groupsJson: string }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const { addSpot } = useSpotActions();
  const [saving, setSaving] = useState(false);

  const parsedGroups: ImportPhoto[][] = groupsJson ? JSON.parse(groupsJson) : [];
  const [groups, setGroups] = useState<SpotGroup[]>(() =>
    parsedGroups.map((photos, i) => ({
      photos,
      name: `Spot ${i + 1}`,
    })),
  );

  const updateName = useCallback((index: number, name: string) => {
    setGroups((prev) => prev.map((g, i) => (i === index ? { ...g, name } : g)));
  }, []);

  const removeGroup = useCallback((index: number) => {
    setGroups((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleImportAll = useCallback(async () => {
    if (saving || groups.length === 0) return;
    setSaving(true);

    try {
      await Promise.all(
        groups.map(async (group) => {
          const firstPhoto = group.photos[0];
          const location = firstPhoto?.location ?? { latitude: 0, longitude: 0 };
          const now = new Date().toISOString();
          const spotId = uuid();
          const firstMediaId = uuid();

          const spot: Spot = {
            id: spotId,
            name: group.name.trim() || undefined,
            location,
            created_at: firstPhoto?.capturedAt ?? now,
            updated_at: now,
            status: SpotStatus.Draft,
            feature: {},
            in_run: { setup_options: [] },
            landing: {},
            metadata: {},
            primary_photo_id: group.photos.length > 0 ? firstMediaId : undefined,
          };

          await addSpot(spot);

          await Promise.all(
            group.photos.map(async (photo, i) => {
              const media: Media = {
                id: i === 0 ? firstMediaId : uuid(),
                spot_id: spotId,
                file_path: photo.uri,
                location: photo.location ?? undefined,
                captured_at: photo.capturedAt,
                created_at: now,
              };
              try {
                await insertMedia(db, media);
              } catch (err) {
                console.error('[ImportReview] insertMedia failed:', err);
              }
            }),
          );
        }),
      );

      router.dismissAll();
    } finally {
      setSaving(false);
    }
  }, [saving, groups, addSpot, db, router]);

  if (parsedGroups.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No photo groups to import.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.subtitle}>
          {groups.length} spot{groups.length !== 1 ? 's' : ''} from your photos. Name each spot
          or leave blank for auto-naming.
        </Text>

        {groups.map((group, groupIdx) => (
          <View key={groupIdx} style={styles.groupCard}>
            {/* Photos strip */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
              {group.photos.map((p, i) => (
                <Image
                  key={i}
                  source={{ uri: p.uri }}
                  style={styles.photoThumb}
                  contentFit="cover"
                />
              ))}
            </ScrollView>

            {/* Meta */}
            <Text style={styles.photoCount}>
              {group.photos.length} photo{group.photos.length !== 1 ? 's' : ''}
              {group.photos[0]?.capturedAt
                ? ` · ${formatDate(group.photos[0].capturedAt)}`
                : ''}
            </Text>

            {/* Name input */}
            <TextInput
              style={styles.nameInput}
              value={group.name}
              onChangeText={(t) => updateName(groupIdx, t)}
              placeholder="Spot name (optional)"
              placeholderTextColor={palette.gray[400]}
              returnKeyType="done"
            />

            <Pressable onPress={() => removeGroup(groupIdx)} hitSlop={8} style={styles.removeRow}>
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [
            styles.importButton,
            (pressed || saving) && styles.importButtonPressed,
          ]}
          onPress={handleImportAll}
          disabled={saving}
          accessibilityRole="button">
          {saving ? (
            <ActivityIndicator color={palette.white} />
          ) : (
            <Text style={styles.importButtonText}>
              Import {groups.length} Spot{groups.length !== 1 ? 's' : ''}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
    gap: spacing.lg,
  },
  subtitle: {
    fontSize: 14,
    color: palette.gray[500],
  },
  groupCard: {
    backgroundColor: palette.gray[50],
    borderRadius: radius.md,
    borderCurve: 'continuous',
    padding: spacing.md,
    gap: spacing.sm,
  },
  photoStrip: {
    maxHeight: 80,
  },
  photoThumb: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    marginRight: spacing.xs,
  },
  photoCount: {
    fontSize: 13,
    color: palette.gray[500],
  },
  nameInput: {
    borderWidth: 1,
    borderColor: palette.gray[300],
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: palette.gray[900],
    backgroundColor: palette.white,
  },
  removeRow: {
    alignSelf: 'flex-end',
  },
  removeText: {
    fontSize: 13,
    color: palette.red[500],
    fontWeight: '500',
  },
  footer: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.gray[200],
    backgroundColor: palette.white,
  },
  importButton: {
    backgroundColor: palette.blue[500],
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
  },
  importButtonPressed: {
    backgroundColor: palette.blue[600],
  },
  importButtonText: {
    color: palette.white,
    fontSize: 17,
    fontWeight: '600',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: palette.gray[500],
  },
});
