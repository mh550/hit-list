import { Suspense } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { DB_NAME } from '@/src/db';
import { DBInitializer } from '@/src/components/DBInitializer';
import { palette } from '@/src/constants/theme';

function LoadingScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={palette.blue[500]} />
    </View>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Suspense fallback={<LoadingScreen />}>
        <SQLiteProvider databaseName={DB_NAME} useSuspense>
          <DBInitializer>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="spot/[id]/index" options={{ title: 'Spot Details' }} />
              <Stack.Screen
                name="spot/[id]/edit"
                options={{ presentation: 'formSheet', title: 'Edit Spot' }}
              />
              <Stack.Screen
                name="add/camera"
                options={{ headerShown: false, animation: 'slide_from_bottom' }}
              />
              <Stack.Screen name="add/review" options={{ title: 'Review Spot' }} />
              <Stack.Screen name="import/index" options={{ title: 'Import Photos' }} />
              <Stack.Screen name="import/review" options={{ title: 'Review Import' }} />
            </Stack>
          </DBInitializer>
        </SQLiteProvider>
      </Suspense>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
