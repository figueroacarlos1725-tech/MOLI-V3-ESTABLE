import { Redirect, Stack } from 'expo-router';
import { MOLI_COLORS } from '@/src/theme/colors';
import { useAuthStore } from '@/src/stores/authStore';

export default function DispatchLayout() {
  const { user, isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) return null;
  if (!isAuthenticated) return <Redirect href="/(auth)/welcome" />;
  if (user?.user_type !== 'admin' && user?.user_type !== 'dispatcher') {
    return <Redirect href={user?.user_type === 'driver' ? '/provider-hub' : '/modules'} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: MOLI_COLORS.offWhite }, animation: 'fade' }}>
      <Stack.Screen name="home" />
    </Stack>
  );
}
