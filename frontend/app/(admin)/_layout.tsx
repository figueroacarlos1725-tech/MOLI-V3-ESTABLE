import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Dimensions } from 'react-native';
import { Redirect, Tabs, usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/src/stores/authStore';
import { MOLI_COLORS, MOLI_RADIUS, MOLI_SPACING } from '@/src/theme/colors';

const { width } = Dimensions.get('window');
const isDesktop = Platform.OS === 'web' && width > 768;

const SIDEBAR_ITEMS = [
  { name: 'dashboard', title: 'Resumen', icon: 'grid' },
  { name: 'godseye', title: 'Ojo de Dios', icon: 'eye' },
  { name: 'trips', title: 'Viajes', icon: 'car' },
  { name: 'users', title: 'Usuarios', icon: 'people' },
  { name: 'fares', title: 'Tarifas', icon: 'cash' },
  { name: 'banners', title: 'Publicidad', icon: 'megaphone' },
  { name: 'coupons', title: 'Cupones', icon: 'pricetag' },
  { name: 'vehicles', title: 'Vehículos', icon: 'car-sport' },
  { name: 'payments', title: 'Pagos', icon: 'card' },
  { name: 'audit', title: 'Historial', icon: 'time' },
  { name: 'settings', title: 'Ajustes', icon: 'settings' },
  { name: 'support', title: 'Soporte', icon: 'chatbubbles' },
  { name: 'verification', title: 'Verificación', icon: 'shield-checkmark' },
  { name: 'messages', title: 'Mensajes', icon: 'mail' },
  { name: 'trabajos', title: 'Moli Trabajos', icon: 'briefcase' },
];

function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const doLogout = async () => {
    await logout();
    router.replace('/(auth)/welcome');
  };

  return (
    <View style={[styles.sidebar, { paddingTop: insets.top + 16 }]}>  
      <View style={styles.sidebarHeader}>
        <View style={styles.brandMark}><Text style={styles.brandMarkText}>M</Text></View>
        <View>
          <Text style={styles.sidebarLogo}>Moli</Text>
          <Text style={styles.sidebarSubtitle}>Centro de operaciones</Text>
        </View>
      </View>
      
      <ScrollView style={styles.sidebarNav} showsVerticalScrollIndicator={false}>
        {SIDEBAR_ITEMS.map((item) => {
          const isActive = pathname.includes(item.name);
          return (
            <TouchableOpacity
              key={item.name}
              style={[styles.sidebarItem, isActive && styles.sidebarItemActive]}
              onPress={() => router.push(`/(admin)/${item.name}` as any)}
            >
              <Ionicons
                name={item.icon as any}
                size={20}
                color={isActive ? MOLI_COLORS.black : '#9CA3AF'}
              />
              <Text style={[styles.sidebarItemText, isActive && styles.sidebarItemTextActive]}>
                {item.title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {showLogoutConfirm ? (
        <View style={styles.sidebarLogoutConfirm}>
          <Text style={styles.sidebarLogoutQuestion}>¿Cerrar sesión?</Text>
          <View style={styles.sidebarLogoutBtns}>
            <TouchableOpacity
              style={styles.sidebarLogoutCancel}
              onPress={() => setShowLogoutConfirm(false)}
            >
              <Text style={styles.sidebarLogoutCancelText}>No</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sidebarLogoutConfirmBtn}
              onPress={doLogout}
            >
              <Text style={styles.sidebarLogoutConfirmText}>Sí, salir</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.sidebarLogout} onPress={() => setShowLogoutConfirm(true)}>
          <Ionicons name="log-out-outline" size={20} color="#EF4444" />
          <Text style={styles.sidebarLogoutText}>Cerrar sesión</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function AdminLayout() {
  const { user, isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) return null;
  if (!isAuthenticated) return <Redirect href="/(auth)/welcome" />;
  if (user?.user_type !== 'admin') {
    return <Redirect href={user?.user_type === 'dispatcher' ? '/(dispatch)/home' : user?.user_type === 'driver' ? '/provider-hub' : '/modules'} />;
  }

  if (isDesktop) {
    return (
      <View style={styles.desktopContainer}>
        <AdminSidebar />
        <View style={styles.desktopContent}>
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarStyle: { display: 'none' },
            }}
          >
            <Tabs.Screen name="dashboard" />
            <Tabs.Screen name="godseye" />
            <Tabs.Screen name="trips" />
            <Tabs.Screen name="users" />
            <Tabs.Screen name="fares" />
            <Tabs.Screen name="banners" />
            <Tabs.Screen name="coupons" />
            <Tabs.Screen name="vehicles" />
            <Tabs.Screen name="payments" />
            <Tabs.Screen name="audit" />
            <Tabs.Screen name="settings" />
            <Tabs.Screen name="support" />
            <Tabs.Screen name="verification" />
          </Tabs>
        </View>
      </View>
    );
  }

  // Mobile layout with bottom tabs
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: MOLI_COLORS.primary,
        tabBarInactiveTintColor: MOLI_COLORS.mediumGray,
        tabBarStyle: {
          backgroundColor: MOLI_COLORS.white,
          borderTopColor: '#E8ECEA',
          height: 68,
          paddingBottom: 10,
          paddingTop: 7,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Panel', tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} /> }} />
      <Tabs.Screen name="godseye" options={{ title: 'Ojo de Dios', tabBarIcon: ({ color, size }) => <Ionicons name="eye" size={size} color={color} /> }} />
      <Tabs.Screen name="trips" options={{ title: 'Viajes', tabBarIcon: ({ color, size }) => <Ionicons name="car" size={size} color={color} /> }} />
      <Tabs.Screen name="users" options={{ title: 'Usuarios', tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} /> }} />
      <Tabs.Screen name="fares" options={{ href: null }} />
      <Tabs.Screen name="banners" options={{ href: null }} />
      <Tabs.Screen name="coupons" options={{ href: null }} />
      <Tabs.Screen name="vehicles" options={{ href: null }} />
      <Tabs.Screen name="payments" options={{ href: null }} />
      <Tabs.Screen name="audit" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ title: 'Ajustes', tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} /> }} />
      <Tabs.Screen name="support" options={{ href: null }} />
      <Tabs.Screen name="verification" options={{ href: null }} />
      <Tabs.Screen name="places" options={{ href: null }} />
      <Tabs.Screen name="messages" options={{ href: null }} />
      <Tabs.Screen name="dispatchers" options={{ href: null }} />
      <Tabs.Screen name="trabajos" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  desktopContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F7F5F2',
  },
  sidebar: {
    width: 264,
    backgroundColor: '#202124',
    paddingHorizontal: MOLI_SPACING.md,
    paddingBottom: 16,
  },
  sidebarHeader: {
    paddingHorizontal: 8,
    paddingBottom: MOLI_SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#26332D',
    marginBottom: 12,
  },
  brandMark: { width: 42, height: 42, borderRadius: 14, backgroundColor: MOLI_COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: MOLI_COLORS.black, fontWeight: '900', fontSize: 22 },
  sidebarLogo: {
    fontSize: 21,
    fontWeight: '800',
    color: MOLI_COLORS.white,
  },
  sidebarSubtitle: {
    fontSize: 9,
    color: '#96A59E',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sidebarNav: {
    flex: 1,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: MOLI_RADIUS.md,
    marginBottom: 4,
    gap: 12,
  },
  sidebarItemActive: {
    backgroundColor: MOLI_COLORS.primary,
  },
  sidebarItemText: {
    fontSize: 14,
    color: '#AEBAB4',
    fontWeight: '500',
  },
  sidebarItemTextActive: {
    color: MOLI_COLORS.black,
    fontWeight: '800',
  },
  sidebarLogout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#374151',
    marginTop: 8,
  },
  sidebarLogoutText: {
    fontSize: 14,
    color: '#EF4444',
    fontWeight: '500',
  },
  sidebarLogoutConfirm: {
    borderTopWidth: 1,
    borderTopColor: '#374151',
    marginTop: 8,
    paddingTop: 10,
    paddingHorizontal: 8,
  },
  sidebarLogoutQuestion: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  sidebarLogoutBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  sidebarLogoutCancel: {
    flex: 1,
    backgroundColor: '#374151',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  sidebarLogoutCancelText: {
    color: '#9CA3AF',
    fontWeight: '600',
    fontSize: 13,
  },
  sidebarLogoutConfirmBtn: {
    flex: 1,
    backgroundColor: '#EF4444',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  sidebarLogoutConfirmText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  desktopContent: {
    flex: 1,
  },
});
