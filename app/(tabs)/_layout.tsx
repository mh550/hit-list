import { Redirect, Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAuthStore } from '@/src/stores/auth-store';
import { selectUnseenCount, useInboxStore } from '@/src/stores/inbox-store';

export default function TabLayout() {
  const status = useAuthStore((s) => s.status);
  const unseen = useInboxStore(selectUnseenCount);

  return (
    <>
      {/* Signed in without an @username yet: onboarding first, whichever way the rider gets back to the tabs. The
          Redirect fires only while the tabs are focused; the Tabs stay mounted under the sign-in sheets. */}
      {status === 'needs_username' ? <Redirect href="/auth/username" /> : null}
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: Colors.light.tint,
          headerShown: true,
          tabBarButton: HapticTab,
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Spots',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="mappin.and.ellipse" color={color} />,
          }}
        />
        <Tabs.Screen
          name="lists"
          options={{
            title: 'Lists',
            headerTitle: 'Hit lists',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="list.bullet" color={color} />,
          }}
        />
        <Tabs.Screen
          name="inbox"
          options={{
            title: 'Inbox',
            tabBarBadge: unseen > 0 ? String(unseen) : undefined,
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="tray.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.fill" color={color} />,
          }}
        />
      </Tabs>
    </>
  );
}
