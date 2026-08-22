import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import { MOLI_COLORS } from '@/src/theme/colors';

export default function AuthCallback() {
  const router = useRouter();
  const { socialLogin } = useAuthStore();
  const params = useLocalSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get session_id from URL hash or params
        const sessionId = params.session_id as string;
        
        if (sessionId) {
          await socialLogin(sessionId);
          router.replace('/');
        } else {
          router.replace('/(auth)/welcome');
        }
      } catch (error) {
        console.error('Auth callback error:', error);
        router.replace('/(auth)/welcome');
      }
    };

    handleCallback();
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={MOLI_COLORS.primary} />
      <Text style={styles.brand}>Moli<Text style={{ color: MOLI_COLORS.coral }}>.</Text></Text>
      <Text style={styles.text}>Estamos preparando tu cuenta…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: MOLI_COLORS.surface,
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    color: MOLI_COLORS.gray,
  },
  brand: { marginTop: 18, fontSize: 22, fontWeight: '900', letterSpacing: -0.5, color: MOLI_COLORS.navy },
});
