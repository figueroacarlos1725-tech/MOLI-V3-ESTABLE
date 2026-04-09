import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';

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
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.text}>Signing you in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
});
