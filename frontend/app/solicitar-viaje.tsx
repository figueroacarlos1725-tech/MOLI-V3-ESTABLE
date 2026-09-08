import React from 'react';
import { Redirect } from 'expo-router';
import RiderHomeScreen from './(rider)/home';
import { useAuthStore } from '@/src/stores/authStore';

export default function RequestRideEntry() {
  const { user, isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) return null;
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  if (user?.user_type !== 'rider') return <Redirect href="/" />;

  return <RiderHomeScreen />;
}
