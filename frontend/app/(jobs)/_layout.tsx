import React from 'react';
import { Stack } from 'expo-router';

export default function JobsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="home" />
      <Stack.Screen name="setup-profile" />
      <Stack.Screen name="job-detail" />
    </Stack>
  );
}
