import React, { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { apiService } from '@/src/services/api';

export default function Index() {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const [trabajosEnabled, setTrabajosEnabled] = useState<boolean | null>(null);
  const [checkingSettings, setCheckingSettings] = useState(true);

  useEffect(() => {
    // Check if Moli Trabajos module is enabled
    const checkSettings = async () => {
      try {
        const url = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        const r = await fetch(`${url}/api/admin/settings/public`);
        if (r.ok) {
          const data = await r.json();
          setTrabajosEnabled(data.trabajos_enabled === true);
        } else {
          setTrabajosEnabled(false);
        }
      } catch {
        setTrabajosEnabled(false);
      } finally {
        setCheckingSettings(false);
      }
    };
    if (isAuthenticated) {
      checkSettings();
    } else {
      setCheckingSettings(false);
    }
  }, [isAuthenticated]);

  if (isLoading || checkingSettings) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#00C853" />
        <Text style={styles.loadingText}>Moli</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/welcome" />;
  }

  // Admin/dispatcher go directly to dispatch dashboard
  if (user?.user_type === 'admin' || user?.user_type === 'dispatcher') {
    return <Redirect href="/(dispatch)/home" />;
  }

  // If Moli Trabajos is enabled, show module selection
  if (trabajosEnabled) {
    return <Redirect href="/modules" />;
  }

  // Otherwise go directly to the appropriate home
  if (user?.user_type === 'driver') {
    return <Redirect href="/provider-hub" />;
  }
  return <Redirect href="/(rider)/home" />;
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
