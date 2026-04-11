import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Image, Text, Dimensions } from 'react-native';
import { Stack } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import ChatNotificationBanner from '@/src/components/ChatNotificationBanner';
import SupportBubble from '@/src/components/SupportBubble';

const { width } = Dimensions.get('window');

export default function RootLayout() {
  const { isLoading, loadStoredAuth } = useAuthStore();
  const [appReady, setAppReady] = useState(false);

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

  if (!appReady || isLoading) {
    return (
      <View style={styles.splashContainer}>
        <Image
          source={require('../assets/images/moli-splash.png')}
          style={styles.splashImage}
          resizeMode="contain"
        />
        <ActivityIndicator size="large" color="#6BBF00" style={styles.loader} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(rider)" />
        <Stack.Screen name="(driver)" />
        <Stack.Screen name="(admin)" />
      </Stack>
      <ChatNotificationBanner />
      <SupportBubble />
    </View>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0D0D0D',
  },
  splashImage: {
    width: width * 0.55,
    height: width * 0.45,
  },
  loader: {
    marginTop: 32,
  },
});
