import React from 'react';
import { Stack } from 'expo-router';
import { MOLI_COLORS } from '@/src/theme/colors';

export default function RiderLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: MOLI_COLORS.offWhite }, animation: 'slide_from_right' }}>
      <Stack.Screen name="home" />
      <Stack.Screen name="rides" />
      <Stack.Screen name="edit-profile" />
      <Stack.Screen name="wallet" />
      <Stack.Screen name="profile" />
    </Stack>
  );
}
