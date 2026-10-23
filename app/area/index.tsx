import { useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { geocodeAsync, type LocationGeocodedLocation } from 'expo-location';
import MapView, { Circle, Marker, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, HeaderTextButton } from '@/src/components';
import { FilterSheet } from '@/src/components/FilterSheet';
import { palette, radius, spacing } from '@/src/constants/theme';
import { useCurrentLocation } from '@/src/hooks/use-current-location';
import { selectActiveFilterCount, selectAreaSpots, useSpotsStore } from '@/src/stores';
import { useLocationStore } from '@/src/stores/location-store';
import { useSettingsStore } from '@/src/stores/settings-store';
import type { GeoPoint } from '@/src/types';
import {
  DEFAULT_AREA_RADIUS_M,
  RADIUS_STEPS_M,
  circleRegion,
  keepsPlace,
  nearestStep,
  radiusLabel,
} from '@/src/utils/area';
import { initialRegion } from '@/src/utils/map-region';
import { spotCountLabel } from '@/src/utils/spot-name';

/** D54: what the area is "of", and where that place put the centre (dragging well away from it drops the name). */
interface Place {
  name: string;
  center: GeoPoint;
}

const MY_LOCATION = 'my location';
const CIRCLE_FILL = `${palette.blue[500]}1F`; // ~12% of the primary blue
const CIRCLE_STROKE = `${palette.blue[500]}B3`;

/**
 * Pick an area: a circle on the map around a fixed centre pin (drag the map to move it), radius chips in the rider's
 * units, a place search, 'Use my location', the shared filters (D55) and a live count of the spots inside.
 * The count is selectAreaSpots, the same rule an area list uses. S2-03: 'Save as hit list' only offers its choices.
 */
export default function AreaPicker() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  useCurrentLocation();
  const spots = useSpotsStore((s) => s.spots);
  const filters = useSpotsStore((s) => s.filters);
  const currentLocation = useLocationStore((s) => s.currentLocation);
  const units = useSettingsStore((s) => s.units);

  // The start is fixed on mount: a fix that arrives later only enables 'Use my location', the map doesn't jump.
  const [start] = useState<{ center: GeoPoint; place?: Place }>(() => {
    if (currentLocation) return { center: currentLocation, place: { name: MY_LOCATION, center: currentLocation } };
    const { latitude, longitude } = initialRegion(spots, null);
    return { center: { latitude, longitude } };
  });
  // react-native-maps reads initialRegion on mount; a new object later could move the camera before the map is ready.
  const [mapStart] = useState(() => circleRegion(start.center, nearestStep(DEFAULT_AREA_RADIUS_M, units)));
  const [center, setCenter] = useState(start.center);
  const [place, setPlace] = useState(start.place);
  const [radiusM, setRadiusM] = useState(() => nearestStep(DEFAULT_AREA_RADIUS_M, units));
  const [searchText, setSearchText] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [filterVisible, setFilterVisible] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const mapRef = useRef<MapView | null>(null);
  // Counts submits, so a geocode answer that lands after a newer search is dropped.
  const searchSeq = useRef(0);

  const areaSpots = useMemo(
    () => selectAreaSpots(spots, center, radiusM, filters),
    [spots, center, radiusM, filters],
  );
  const activeFilterCount = selectActiveFilterCount(filters);

  const moveTo = (point: GeoPoint, placeName: string) => {
    setCenter(point);
    setPlace({ name: placeName, center: point });
    mapRef.current?.animateToRegion(circleRegion(point, radiusM));
  };

  // Never geocodes: only a submitted search does.
  const onRegionChangeComplete = ({ latitude, longitude }: Region) => {
    const next = { latitude, longitude };
    setCenter(next);
    if (place && !keepsPlace(place.center, next, radiusM)) setPlace(undefined);
  };

  const pickRadius = (step: number) => {
    setRadiusM(step);
    mapRef.current?.animateToRegion(circleRegion(center, step));
  };

  const search = async () => {
    const text = searchText.trim();
    if (text === '') return;
    const seq = ++searchSeq.current;
    let results: LocationGeocodedLocation[];
    try {
      results = await geocodeAsync(text); // Apple's geocoder: the typed text goes to Apple
    } catch {
      results = []; // offline or rate-limited reads the same as no match
    }
    if (seq !== searchSeq.current) return;
    const hit = results[0];
    if (!hit) {
      setNotFound(true);
      return;
    }
    setNotFound(false);
    moveTo({ latitude: hit.latitude, longitude: hit.longitude }, text);
  };

  const onSearchTextChange = (text: string) => {
    setSearchText(text);
    setNotFound(false);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerLeft: () => <HeaderTextButton onPress={() => router.back()}>Cancel</HeaderTextButton>,
          headerRight: () => (
            <HeaderTextButton
              onPress={() => setFilterVisible(true)}
              accessibilityLabel={`Filter spots${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ''}`}
              emphasized={activeFilterCount > 0}>
              {`Filter${activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}`}
            </HeaderTextButton>
          ),
        }}
      />
      <View style={styles.searchRow}>
        <TextInput
          style={styles.search}
          value={searchText}
          onChangeText={onSearchTextChange}
          onSubmitEditing={search}
          placeholder="Search a place"
          placeholderTextColor={palette.gray[500]}
          accessibilityLabel="Search a place"
          accessibilityRole="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
          returnKeyType="search"
        />
        <Button
          title="Use my location"
          variant="secondary"
          size="sm"
          disabled={currentLocation == null}
          onPress={() => currentLocation && moveTo(currentLocation, MY_LOCATION)}
        />
      </View>
      {notFound ? <Text style={styles.notFound}>No place found</Text> : null}

      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={mapStart}
          onRegionChangeComplete={onRegionChangeComplete}>
          <Circle
            center={center}
            radius={radiusM}
            fillColor={CIRCLE_FILL}
            strokeColor={CIRCLE_STROKE}
            strokeWidth={2}
          />
          {areaSpots.map((s) => (
            <Marker key={s.id} coordinate={s.location} pinColor={palette.blue[500]} />
          ))}
        </MapView>
        {/* The map moves under this pin; its tip is the circle's centre. */}
        <View style={styles.pinLayer} pointerEvents="none">
          <View style={styles.pin} testID="area-center-pin">
            <View style={styles.pinHead} />
            <View style={styles.pinStem} />
          </View>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {RADIUS_STEPS_M[units].map((step) => (
          <Chip
            key={step}
            role="radio"
            label={radiusLabel(step, units)}
            selected={step === radiusM}
            onPress={() => pickRadius(step)}
          />
        ))}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Text style={styles.count} accessibilityLiveRegion="polite">
          {spotCountLabel(areaSpots.length)}
        </Text>
        <Button title="Save as hit list" onPress={() => setChoosing(true)} />
      </View>

      <FilterSheet visible={filterVisible} onClose={() => setFilterVisible(false)} />
      <SaveChooser visible={choosing} count={areaSpots.length} onClose={() => setChoosing(false)} />
    </View>
  );
}

interface ChooserProps {
  visible: boolean;
  count: number;
  onClose: () => void;
}

/** 'Save as hit list': a snapshot of the spots inside now, or an area list that keeps up. S2-03: both just close. */
function SaveChooser({ visible, count, onClose }: ChooserProps) {
  if (!visible) return null;
  const justThese = `Just these ${spotCountLabel(count)}`;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
        <View style={styles.card}>
          <Text style={styles.cardTitle} accessibilityRole="header">
            Save as hit list
          </Text>
          {count > 0 ? (
            <ChooserOption
              title={justThese}
              hint="A normal hit list of the spots inside the circle right now"
              onPress={onClose}
            />
          ) : null}
          <ChooserOption
            title="Keep it updated"
            hint="An area list: your spots inside this circle, now and later"
            onPress={onClose}
          />
          <View style={styles.cardButtons}>
            <Button title="Cancel" variant="secondary" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ChooserOption({ title, hint, onPress }: { title: string; hint: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}>
      <Text style={styles.optionTitle}>{title}</Text>
      <Text style={styles.optionHint}>{hint}</Text>
    </Pressable>
  );
}

const PIN_HEAD = 16;
const PIN_STEM = 14;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  search: {
    flex: 1,
    backgroundColor: palette.gray[100],
    borderRadius: radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: palette.gray[900],
  },
  notFound: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    fontSize: 14,
    color: palette.red[700],
  },
  mapWrap: {
    flex: 1,
  },
  pinLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pin: {
    alignItems: 'center',
    // Lift the pin by half its height so the stem's tip, not its middle, sits on the centre.
    transform: [{ translateY: -(PIN_HEAD + PIN_STEM) / 2 }],
  },
  pinHead: {
    width: PIN_HEAD,
    height: PIN_HEAD,
    borderRadius: PIN_HEAD / 2,
    backgroundColor: palette.blue[500],
    borderWidth: 2,
    borderColor: palette.white,
  },
  pinStem: {
    width: 2,
    height: PIN_STEM,
    backgroundColor: palette.blue[500],
  },
  chips: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.gray[200],
  },
  count: {
    fontSize: 17,
    fontWeight: '600',
    color: palette.gray[900],
    fontVariant: ['tabular-nums'],
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  card: {
    backgroundColor: palette.white,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.gray[900],
  },
  option: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: palette.gray[200],
    gap: spacing.xs,
  },
  optionPressed: {
    backgroundColor: palette.gray[100],
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.blue[500],
  },
  optionHint: {
    fontSize: 14,
    color: palette.gray[500],
  },
  cardButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});
