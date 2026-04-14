import React from 'react';
import { Stack } from 'expo-router';

export default function DriverLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="home" />
      <Stack.Screen name="rides" />
      <Stack.Screen name="earnings" />
      <Stack.Screen name="taximeter" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="inbox" />
      <Stack.Screen name="documents" />
    </Stack>
  );
}
