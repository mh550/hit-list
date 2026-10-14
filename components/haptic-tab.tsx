import type { BottomTabBarButtonProps } from 'expo-router/js-tabs';
import * as Haptics from 'expo-haptics';
import { Pressable } from 'react-native';

// The tab bar's ref type still describes the removed PlatformPressable, so it is not forwarded.
export function HapticTab({ ref: _ref, ...props }: BottomTabBarButtonProps) {
  return (
    <Pressable
      {...props}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === 'ios') {
          // Add a soft haptic feedback when pressing down on the tabs.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}
