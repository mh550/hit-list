import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useIsFocused } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';

import { colors, palette } from '@/src/constants/theme';
import { SpotStatus } from '@/src/types';
import type { GeoPoint, Spot } from '@/src/types';
import { isKnownLocation } from '@/src/utils/geo';
import { initialRegion } from '@/src/utils/map-region';
import { featureLabel, getSpotDisplayName } from '@/src/utils/spot-name';

export const DRAFT_PIN = palette.yellow[500];
export const SPOT_PIN = colors.light.primary;

interface Props {
  spots: Spot[];
  currentLocation: GeoPoint | null;
  onOpenSpot: (id: string) => void;
}

/** Apple Maps (react-native-maps default provider, D2) with one pin per spot; no clustering yet (D8). */
export function SpotMap({ spots, currentLocation, onOpenSpot }: Props) {
  // Starting region only: after mount the user owns the camera, so filtering doesn't jump the map.
  const [region] = useState(() => initialRegion(spots, currentLocation));
  // Only track the user while this tab is on screen; a mounted-but-hidden map would keep GPS on.
  const focused = useIsFocused();

  return (
    <MapView style={StyleSheet.absoluteFill} initialRegion={region} showsUserLocation={focused}>
      {spots.filter((s) => isKnownLocation(s.location)).map((spot) => {
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
      })}
    </MapView>
  );
}
