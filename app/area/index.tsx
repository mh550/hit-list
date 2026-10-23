import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { geocodeAsync, type LocationGeocodedLocation } from 'expo-location';
import MapView, { Circle, Marker, type Details, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, EmptyState, HeaderTextButton, NameListCard, useGuardedSubmit } from '@/src/components';
import { FilterSheet } from '@/src/components/FilterSheet';
import { palette, radius, spacing } from '@/src/constants/theme';
import { useCurrentLocation } from '@/src/hooks/use-current-location';
import { useHitListActions } from '@/src/hooks/use-hit-list-actions';
import { selectActiveFilterCount, selectAreaSpots, useHitListsStore, useSpotsStore } from '@/src/stores';
import { useLocationStore } from '@/src/stores/location-store';
import { useSettingsStore } from '@/src/stores/settings-store';
import type { GeoPoint, HitList } from '@/src/types';
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

type AreaList = HitList & { kind: 'area'; area_center: GeoPoint; area_radius_m: number };
const isAreaList = (list: HitList | undefined): list is AreaList =>
  list?.kind === 'area' && list.area_center !== undefined && list.area_radius_m !== undefined;

/**
 * Pick an area: a circle on the map around a fixed centre pin (drag the map to move it), radius chips in the rider's
 * units, a place search, 'Use my location', the shared filters (D55) and a live count of the spots inside.
 * The count is selectAreaSpots, the same rule an area list uses. 'Save as hit list' makes a manual list of the spots
 * inside now or an area list of the circle; with `?listId` it edits that area list's circle ('Save area').
 */
export default function AreaPicker() {
  const { listId } = useLocalSearchParams<{ listId?: string }>();
  const editList = useHitListsStore((s) =>
    listId === undefined ? undefined : s.lists.find((l) => l.id === listId && l.deleted_at === undefined),
  );
  const router = useRouter();
  if (listId === undefined) return <AreaPickerBody />;
  if (!isAreaList(editList)) {
    // A full-screen modal: Cancel is the only way out.
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            headerLeft: () => <HeaderTextButton onPress={() => router.back()}>Cancel</HeaderTextButton>,
            headerRight: () => null,
          }}
        />
        <EmptyState icon="list.bullet" title="This list is gone" message="It may have been deleted." />
      </View>
    );
  }
  return <AreaPickerBody editList={editList} />;
}

function AreaPickerBody({ editList }: { editList?: AreaList }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  useCurrentLocation();
  const spots = useSpotsStore((s) => s.spots);
  const filters = useSpotsStore((s) => s.filters);
  const currentLocation = useLocationStore((s) => s.currentLocation);
  const units = useSettingsStore((s) => s.units);
  const { createList, addSpotsToList, deleteList, updateHitList } = useHitListActions();

  // The start is fixed on mount: a fix that arrives later only enables 'Use my location', the map doesn't jump.
  const [start] = useState<{ center: GeoPoint; place?: Place; radiusM: number }>(() => {
    if (editList) {
      const { area_center, area_place, area_radius_m } = editList;
      return {
        center: area_center,
        place: area_place === undefined ? undefined : { name: area_place, center: area_center },
        radiusM: area_radius_m, // kept as saved, even off this unit's chips (D56)
      };
    }
    const radiusM = nearestStep(DEFAULT_AREA_RADIUS_M, units);
    if (currentLocation) {
      return { center: currentLocation, place: { name: MY_LOCATION, center: currentLocation }, radiusM };
    }
    const { latitude, longitude } = initialRegion(spots, null);
    return { center: { latitude, longitude }, radiusM };
  });
  const [center, setCenter] = useState(start.center);
  const [place, setPlace] = useState(start.place);
  const [radiusM, setRadiusM] = useState(start.radiusM);
  // react-native-maps reads initialRegion on mount; a new object later could move the camera before the map is ready.
  const [mapStart] = useState(() => circleRegion(start.center, radiusM));
  const [searchText, setSearchText] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [filterVisible, setFilterVisible] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [savingArea, setSavingArea] = useState(false);
  const mapRef = useRef<MapView | null>(null);
  // A geocode answer applies only if nothing has moved the centre or changed the text since its submit: every such
  // action bumps this counter.
  const searchSeq = useRef(0);
  // The radius a late geocode answer must fit the camera to (the one in its closure may be stale).
  const radiusRef = useRef(radiusM);

  const areaSpots = useMemo(
    () => selectAreaSpots(spots, center, radiusM, filters),
    [spots, center, radiusM, filters],
  );
  const activeFilterCount = selectActiveFilterCount(filters);

  // D55: editing an area list loads its filters into the shared ones (the Filter badge shows them); once per list.
  const editListId = editList?.id;
  useEffect(() => {
    const list = useHitListsStore.getState().lists.find((l) => l.id === editListId);
    if (!list) return;
    const { resetFilters, setFilters } = useSpotsStore.getState();
    resetFilters();
    if (list.area_filters) setFilters(list.area_filters);
  }, [editListId]);

  const reportSaveFailure = () => Alert.alert("Couldn't save the list", 'Please try again.');

  const saveNewList = async (kind: SaveKind, name: string) => {
    let listId: string;
    try {
      if (kind === 'manual') {
        const ids = areaSpots.map((s) => s.id); // the spots inside at the moment of Create
        listId = (await createList(name, { kind: 'manual' })).id;
        try {
          await addSpotsToList(listId, ids);
        } catch (err) {
          // Don't leave an empty copy behind for the retry to duplicate (the hook logs a failed delete).
          deleteList(listId).catch(() => {});
          throw err;
        }
      } else {
        const list = await createList(name, {
          kind: 'area',
          area_center: center,
          area_radius_m: radiusM,
          area_place: place?.name,
          area_filters: { ...filters },
        });
        listId = list.id;
      }
    } catch (err) {
      // useHitListActions has logged it and taken the list back out of the store; the name sheet stays open.
      reportSaveFailure();
      throw err;
    }
    router.replace(`/list/${listId}`);
  };

  const saveArea = async () => {
    if (!editList || savingArea) return;
    setSavingArea(true);
    try {
      await updateHitList(editList.id, {
        area_center: center,
        area_radius_m: radiusM,
        area_place: place?.name ?? null,
        area_filters: { ...filters },
      });
    } catch {
      setSavingArea(false);
      reportSaveFailure();
      return;
    }
    router.back();
  };

  const cancelSearch = () => {
    searchSeq.current += 1;
  };

  const moveTo = (point: GeoPoint, placeName: string) => {
    setCenter(point);
    setPlace({ name: placeName, center: point });
    mapRef.current?.animateToRegion(circleRegion(point, radiusRef.current));
  };

  // Never geocodes: only a submitted search does. A drag wins over a search still in flight.
  const onRegionChangeComplete = ({ latitude, longitude }: Region, details?: Details) => {
    if (details?.isGesture) cancelSearch();
    const next = { latitude, longitude };
    setCenter(next);
    if (place && !keepsPlace(place.center, next, radiusM)) setPlace(undefined);
  };

  const pickRadius = (step: number) => {
    // An unchanged region would leave the native map ignoring region changes until the next one (react-native-maps).
    if (step === radiusM) return;
    radiusRef.current = step;
    setRadiusM(step);
    mapRef.current?.animateToRegion(circleRegion(center, step));
  };

  const goToMyLocation = () => {
    if (!currentLocation) return;
    cancelSearch();
    moveTo(currentLocation, MY_LOCATION);
  };

  const search = async () => {
    const text = searchText.trim();
    if (text === '') return;
    cancelSearch();
    const seq = searchSeq.current;
    let results: LocationGeocodedLocation[];
    try {
      results = await geocodeAsync(text); // Apple's geocoder: the typed text goes to Apple
    } catch {
      results = []; // offline or rate-limited reads the same as no match
    }
    if (seq !== searchSeq.current) return;
    // The native geocoder returns null coordinates for a placemark without a location, whatever the types say.
    const hit = results.find((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
    if (!hit) {
      setNotFound(true);
      return;
    }
    setNotFound(false);
    moveTo({ latitude: hit.latitude, longitude: hit.longitude }, text);
  };

  const onSearchTextChange = (text: string) => {
    cancelSearch();
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
          onPress={goToMyLocation}
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
        {editList ? (
          <Button title="Save area" onPress={saveArea} disabled={savingArea} />
        ) : (
          <Button title="Save as hit list" onPress={() => setChoosing(true)} />
        )}
      </View>

      <FilterSheet visible={filterVisible} onClose={() => setFilterVisible(false)} />
      <SaveChooser
        visible={choosing}
        count={areaSpots.length}
        onClose={() => setChoosing(false)}
        onSave={saveNewList}
      />
    </View>
  );
}

/** 'Just these N' (a manual list of the spots inside now) or 'Keep it updated' (an area list). */
type SaveKind = 'manual' | 'area';

interface ChooserProps {
  visible: boolean;
  count: number;
  onClose: () => void;
  /** Rejects to keep the name card open (the caller has said why). */
  onSave: (kind: SaveKind, name: string) => Promise<void>;
}

/** 'Save as hit list': mounted only while visible, so every open starts at the choice. */
function SaveChooser({ visible, ...rest }: ChooserProps) {
  if (!visible) return null;
  return <SaveChooserContent {...rest} />;
}

/**
 * A snapshot of the spots inside now, or an area list that keeps up; then the list's name. Both steps share one
 * Modal: iOS doesn't present a second Modal while the first is still going away.
 */
function SaveChooserContent({ count, onClose, onSave }: Omit<ChooserProps, 'visible'>) {
  const [kind, setKind] = useState<SaveKind | null>(null);
  const { submitting, submit, cancel } = useGuardedSubmit((name) => (kind ? onSave(kind, name) : undefined), onClose);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={cancel}>
      <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={cancel} accessible={false} />
        {kind ? (
          <NameListCard
            title="New hit list"
            confirmLabel="Create"
            submitting={submitting}
            onCancel={cancel}
            onSubmit={submit}
          />
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle} accessibilityRole="header">
              Save as hit list
            </Text>
            {count > 0 ? (
              <ChooserOption
                title={`Just these ${spotCountLabel(count)}`}
                hint="A normal hit list of the spots inside the circle right now"
                onPress={() => setKind('manual')}
              />
            ) : null}
            <ChooserOption
              title="Keep it updated"
              hint="An area list: your spots inside this circle, now and later"
              onPress={() => setKind('area')}
            />
            <View style={styles.cardButtons}>
              <Button title="Cancel" variant="secondary" onPress={onClose} />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
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
