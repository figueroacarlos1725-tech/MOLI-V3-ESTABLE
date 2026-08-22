import { Stack } from 'expo-router';
import { MOLI_COLORS } from '@/src/theme/colors';

export default function DispatchLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: MOLI_COLORS.offWhite }, animation: 'fade' }}>
      <Stack.Screen name="home" />
    </Stack>
  );
}
