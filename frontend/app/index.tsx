import React from 'react';
import { Redirect } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';

export default function Index() {
  const { user, isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#6BBF00" />
        <Text style={styles.loadingText}>Cargando Moli...</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/welcome" />;
  }

  // Redirect based on user type
  switch (user?.user_type) {
    case 'driver':
      return <Redirect href="/(driver)/home" />;
    case 'admin':
    case 'dispatcher':
      return <Redirect href="/(admin)/dashboard" />;
    case 'rider':
    default:
      return <Redirect href="/(rider)/home" />;
  }
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
