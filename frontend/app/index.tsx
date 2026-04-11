import React from 'react';
import { Redirect } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';

export default function Index() {
  const { user, isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#A855F7" />
        <Text style={styles.loadingText}>Cargando Moli...</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/welcome" />;
  }

  // Admin/dispatcher go directly to dashboard
  if (user?.user_type === 'admin' || user?.user_type === 'dispatcher') {
    return <Redirect href="/(admin)/dashboard" />;
  }

  // Everyone else goes to module selection
  return <Redirect href="/modules" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
});
