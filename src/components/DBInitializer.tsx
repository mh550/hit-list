import type { ReactNode } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useDbInit } from '@/src/hooks/use-db-init';
import { palette } from '@/src/constants/theme';

interface Props {
  children: ReactNode;
}

export function DBInitializer({ children }: Props) {
  const { isReady } = useDbInit();

  if (!isReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={palette.blue[500]} />
      </View>
    );
  }

  return <>{children}</>;
}
