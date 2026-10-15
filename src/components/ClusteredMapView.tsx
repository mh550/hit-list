import type { ComponentProps, ComponentType } from 'react';
import LibMapView from 'react-native-map-clustering';
import type NativeMapView from 'react-native-maps';

import type { ClusterLeaf } from '@/src/utils/cluster-press';

/**
 * react-native-map-clustering's props with the two callbacks its index.d.ts gets wrong corrected; every other prop is
 * typed as the library declares it.
 */
export type ClusteredMapViewProps = Omit<ComponentProps<typeof LibMapView>, 'mapRef' | 'onClusterPress'> & {
  /** A callback ref: the react-native-maps MapView instance, then null on unmount (d.ts: `React.Ref<Map>`). */
  mapRef?: (map: NativeMapView | null) => void;
  /** `leaves` are the cluster's supercluster features (d.ts: `Marker[]`); `cluster` is unused here. */
  onClusterPress?: (cluster: unknown, leaves?: ClusterLeaf[]) => void;
};

/**
 * react-native-map-clustering's MapView, retyped. The one cast: the library passes these values at runtime
 * (lib/ClusteredMapView.js calls `mapRef(map)` from react-native-maps' ref and `onClusterPress(cluster, children)` with
 * supercluster leaves), so only the declared types change, not the component.
 */
export const ClusteredMapView = LibMapView as unknown as ComponentType<ClusteredMapViewProps>;
