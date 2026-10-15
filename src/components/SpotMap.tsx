import { useCallback, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, Platform, StyleSheet } from 'react-native';
import { useIsFocused } from 'expo-router';
import { Marker } from 'react-native-maps';
import type NativeMapView from 'react-native-maps';

import { ClusteredMapView } from '@/src/components/ClusteredMapView';
import { colors, palette } from '@/src/constants/theme';
import { SpotStatus } from '@/src/types';
import type { GeoPoint, Spot } from '@/src/types';
import { clusterPressTarget } from '@/src/utils/cluster-press';
import type { ClusterLeaf } from '@/src/utils/cluster-press';
import { isKnownLocation } from '@/src/utils/geo';
import { initialRegion } from '@/src/utils/map-region';
import { featureLabel, getSpotDisplayName } from '@/src/utils/spot-name';

export const DRAFT_PIN = palette.yellow[500];
export const SPOT_PIN = colors.light.primary;

const EDGE_PADDING = { top: 50, right: 50, bottom: 50, left: 50 };

interface Props {
  spots: Spot[];
  currentLocation: GeoPoint | null;
  onOpenSpot: (id: string) => void;
}

/**
 * Apple Maps (react-native-maps default provider, D2) with one pin per spot. Pins that overlap (D8: several spots at
 * one place) merge into a numbered cluster via react-native-map-clustering. Tapping a cluster zooms to its spots,
 * unless they are all within SAME_PLACE_METERS of each other: zooming cannot separate those, so the tap lists them in
 * an action sheet (iOS; other platforms just zoom). The library's spiral fan-out is off: it lost every cluster after
 * the first when several were on screen at zoom >= 18.
 */
export function SpotMap({ spots, currentLocation, onOpenSpot }: Props) {
  // Starting region only: after mount the user owns the camera, so filtering doesn't jump the map.
  const [region] = useState(() => initialRegion(spots, currentLocation));
  // Only track the user while this tab is on screen; a mounted-but-hidden map would keep GPS on.
  const focused = useIsFocused();
  // preserveClusterPressBehavior stops the library zooming on cluster tap, so SpotMap zooms with its own ref.
  const mapRef = useRef<NativeMapView | null>(null);
  const setMap = useCallback((map: NativeMapView | null) => {
    mapRef.current = map;
  }, []);

  const handleClusterPress = useCallback(
    (_cluster: unknown, leaves: ClusterLeaf[] = []) => {
      const { ids, coords, samePlace } = clusterPressTarget(leaves);
      const listed = ids.map((id) => spots.find((s) => s.id === id)).filter((s): s is Spot => s !== undefined);
      if (samePlace && listed.length > 0 && Platform.OS === 'ios') {
        const names = listed.map(getSpotDisplayName);
        ActionSheetIOS.showActionSheetWithOptions(
          { title: `${names.length} spots here`, options: [...names, 'Cancel'], cancelButtonIndex: names.length },
          (i) => {
            if (i < names.length) onOpenSpot(listed[i].id);
          },
        );
        return;
      }
      mapRef.current?.fitToCoordinates(coords, { edgePadding: EDGE_PADDING, animated: true });
    },
    [spots, onOpenSpot],
  );

  // Memoised so SpotsScreen re-renders (location fixes, media store, focus) don't rebuild the supercluster index,
  // which the library redoes whenever its children change.
  const markers = useMemo(
    () =>
      spots.filter((s) => isKnownLocation(s.location)).map((spot) => {
        const isDraft = spot.status === SpotStatus.Draft;
        return (
          <Marker
            key={spot.id}
            identifier={spot.id}
            testID={`spot-marker-${spot.id}`}
            coordinate={spot.location}
            title={getSpotDisplayName(spot)}
            description={isDraft ? 'Draft' : featureLabel(spot)}
            pinColor={isDraft ? DRAFT_PIN : SPOT_PIN}
            onCalloutPress={() => onOpenSpot(spot.id)}
          />
        );
      }),
    [spots, onOpenSpot],
  );

  return (
    <ClusteredMapView
      mapRef={setMap}
      style={StyleSheet.absoluteFill}
      initialRegion={region}
      showsUserLocation={focused}
      clusterColor={SPOT_PIN}
      clusterTextColor={palette.white}
      spiralEnabled={false}
      // The library's LayoutAnimation.configureNext on every region change would animate the whole app's next layout.
      animationEnabled={false}
      preserveClusterPressBehavior
      onClusterPress={handleClusterPress}
    >
      {markers}
    </ClusteredMapView>
  );
}
