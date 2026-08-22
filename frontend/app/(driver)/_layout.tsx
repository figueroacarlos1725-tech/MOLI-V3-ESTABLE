import React from 'react';
import { Stack } from 'expo-router';
import { MOLI_COLORS } from '@/src/theme/colors';

export default function DriverLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: MOLI_COLORS.offWhite }, animation: 'slide_from_right' }}>
      <Stack.Screen name="home" />
      <Stack.Screen name="rides" />
      <Stack.Screen name="earnings" />
      <Stack.Screen name="deliveries" />
      <Stack.Screen name="taximeter" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="inbox" />
      <Stack.Screen name="documents" />
    </Stack>
  );
}
