import { useColorScheme as useRNColorScheme } from 'react-native';

export type ColorScheme = 'light' | 'dark';

/**
 * RN >= 0.83 types this as 'light' | 'dark' | 'unspecified' and it can be null at runtime
 * (Jest, web before hydration); collapse to the two schemes the app knows.
 */
export function useColorScheme(): ColorScheme {
  return useRNColorScheme() === 'dark' ? 'dark' : 'light';
}
