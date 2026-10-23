import { Suspense } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { DB_NAME } from '@/src/db';
import { DBInitializer } from '@/src/components/DBInitializer';
import { useAuthInit } from '@/src/hooks/use-auth-init';
import { palette } from '@/src/constants/theme';

function LoadingScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={palette.blue[500]} />
    </View>
  );
}

// Mirrors the Supabase session into the auth store; inside DBInitializer, so it starts once the DB is ready.
function AuthInit() {
  useAuthInit();
  return null;
}

// Light only (app.json userInterfaceStyle "light"): the screens use light-theme colours and set no
// backgrounds, so DarkTheme's near-black would hide their text.
// GestureHandlerRootView wraps everything so any screen (the photo viewer) can use gesture-handler.
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={DefaultTheme}>
        <Suspense fallback={<LoadingScreen />}>
          <SQLiteProvider databaseName={DB_NAME} useSuspense>
            <DBInitializer>
              <AuthInit />
              <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="spot/[id]/index" options={{ title: 'Spot Details' }} />
                <Stack.Screen
                  name="spot/[id]/edit"
                  options={{ presentation: 'formSheet', title: 'Edit Spot' }}
                />
                <Stack.Screen
                  name="spot/[id]/photos"
                  options={{ presentation: 'fullScreenModal', headerShown: false }}
                />
                <Stack.Screen
                  name="add/camera"
                  options={{ headerShown: false, animation: 'slide_from_bottom' }}
                />
                <Stack.Screen name="add/review" options={{ title: 'Review Spot' }} />
                <Stack.Screen name="import/index" options={{ title: 'Import Photos' }} />
                <Stack.Screen name="import/review" options={{ title: 'Review Import' }} />
                <Stack.Screen name="list/[id]/index" options={{ title: 'Hit list' }} />
                <Stack.Screen
                  name="area/index"
                  options={{ presentation: 'fullScreenModal', title: 'Pick an area' }}
                />
                <Stack.Screen name="auth/sign-in" options={{ presentation: 'modal', title: 'Sign in' }} />
                <Stack.Screen name="auth/code" options={{ title: 'Enter code' }} />
                <Stack.Screen
                  name="auth/username"
                  options={{ title: 'Your username', headerBackVisible: false, gestureEnabled: false }}
                />
              </Stack>
            </DBInitializer>
          </SQLiteProvider>
        </Suspense>
        <StatusBar style="dark" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
