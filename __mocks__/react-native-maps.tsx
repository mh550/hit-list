// Manual mock of react-native-maps 1.27.2 for Jest. Prop names are copied from
// node_modules/react-native-maps/dist/src/{MapView,MapMarker}.d.ts; each
// component is a View that keeps its props so tests can assert on them.
// MapView also exposes the imperative methods of MapView.d.ts (the ones the app calls,
// e.g. react-native-map-clustering's cluster press) as the shared jest.fn()s in
// `mockMapMethods`; reset them in a test's beforeEach, e.g. `mockMapMethods.fitToCoordinates.mockReset()`.
import { forwardRef, useImperativeHandle } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ViewProps } from 'react-native';
import type { LatLng } from 'react-native-maps';

type AnyProps = { children?: ReactNode; testID?: string; [key: string]: unknown };

type FitToOptions = { edgePadding?: { top: number; right: number; bottom: number; left: number }; animated?: boolean };

export const mockMapMethods = {
  fitToCoordinates: jest.fn<void, [coordinates?: LatLng[], options?: FitToOptions]>(),
};

const MapView = forwardRef<typeof mockMapMethods, ViewProps>(function MapView(
  { children, testID = 'map-view', ...props },
  ref,
) {
  useImperativeHandle(ref, () => mockMapMethods, []);
  return (
    <View testID={testID} {...props}>
      {children}
    </View>
  );
});

export function Marker({ children, ...props }: AnyProps) {
  return <View {...props}>{children}</View>;
}

export default MapView;
