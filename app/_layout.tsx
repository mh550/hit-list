import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
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
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
