// Manual mock of react-native-maps 1.27.2 for Jest. Prop names are copied from
// node_modules/react-native-maps/dist/src/{index,MapView,MapMarker,MapCallout}.d.ts; each
// component is a View that keeps its props so tests can assert on them.
import type { ReactNode } from 'react';
import { View } from 'react-native';

type AnyProps = { children?: ReactNode; testID?: string; [key: string]: unknown };

function MapView({ children, testID = 'map-view', ...props }: AnyProps) {
  return (
    <View testID={testID} {...props}>
      {children}
    </View>
  );
}

export function Marker({ children, ...props }: AnyProps) {
  return <View {...props}>{children}</View>;
}

export function Callout({ children, ...props }: AnyProps) {
  return <View {...props}>{children}</View>;
}

export const PROVIDER_DEFAULT = undefined;
export default MapView;
