import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import ChatNotificationBanner from '@/src/components/ChatNotificationBanner';
import SupportBubble from '@/src/components/SupportBubble';
import AnimatedSplash from '@/src/components/AnimatedSplash';

export default function RootLayout() {
  const { isLoading, loadStoredAuth } = useAuthStore();
  const [appReady, setAppReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        await loadStoredAuth();
      } catch (e) {
        console.log('Auth load error:', e);
      } finally {
        setAppReady(true);
      }
    };
    init();
  }, []);

  // Show animated splash until both app is ready AND splash animation is done
  if (!appReady || isLoading || !splashDone) {
    return (
      <View style={styles.splashContainer}>
        <AnimatedSplash onFinish={() => setSplashDone(true)} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="modules" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(rider)" />
        <Stack.Screen name="(driver)" />
        <Stack.Screen name="(admin)" />
        <Stack.Screen name="(jobs)" />
      </Stack>
      <ChatNotificationBanner />
      <SupportBubble />
    </View>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#0F0B15',
  },
});
