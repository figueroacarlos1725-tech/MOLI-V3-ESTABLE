import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Dimensions } from 'react-native';
import { Tabs, usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/src/stores/authStore';

const { width } = Dimensions.get('window');
const isDesktop = Platform.OS === 'web' && width > 768;

const SIDEBAR_ITEMS = [
  { name: 'dashboard', title: 'Panel', icon: 'grid' },
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
        <Text style={styles.sidebarLogo}>Molí</Text>
        <Text style={styles.sidebarSubtitle}>Admin</Text>
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
                color={isActive ? '#fff' : '#9CA3AF'}
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
        tabBarActiveTintColor: '#8E44AD',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#E5E5EA',
          height: 56,
          paddingBottom: 6,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Panel', tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} /> }} />
      <Tabs.Screen name="godseye" options={{ title: 'Ojo de Dios', tabBarIcon: ({ color, size }) => <Ionicons name="eye" size={size} color={color} /> }} />
      <Tabs.Screen name="trips" options={{ title: 'Viajes', tabBarIcon: ({ color, size }) => <Ionicons name="car" size={size} color={color} /> }} />
      <Tabs.Screen name="users" options={{ title: 'Usuarios', tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} /> }} />
      <Tabs.Screen name="fares" options={{ title: 'Tarifas', tabBarIcon: ({ color, size }) => <Ionicons name="cash" size={size} color={color} /> }} />
      <Tabs.Screen name="banners" options={{ title: 'Publicidad', tabBarIcon: ({ color, size }) => <Ionicons name="megaphone" size={size} color={color} /> }} />
      <Tabs.Screen name="coupons" options={{ title: 'Cupones', tabBarIcon: ({ color, size }) => <Ionicons name="pricetag" size={size} color={color} /> }} />
      <Tabs.Screen name="vehicles" options={{ title: 'Vehículos', tabBarIcon: ({ color, size }) => <Ionicons name="car-sport" size={size} color={color} /> }} />
      <Tabs.Screen name="payments" options={{ title: 'Pagos', tabBarIcon: ({ color, size }) => <Ionicons name="card" size={size} color={color} /> }} />
      <Tabs.Screen name="audit" options={{ title: 'Historial', tabBarIcon: ({ color, size }) => <Ionicons name="time" size={size} color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Ajustes', tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} /> }} />
      <Tabs.Screen name="support" options={{ title: 'Soporte', tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" size={size} color={color} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  desktopContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
  },
  sidebar: {
    width: 240,
    backgroundColor: '#1F2937',
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
  sidebarHeader: {
    paddingHorizontal: 12,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
    marginBottom: 12,
  },
  sidebarLogo: {
    fontSize: 28,
    fontWeight: '800',
    color: '#6BBF00',
  },
  sidebarSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
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
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 2,
    gap: 12,
  },
  sidebarItemActive: {
    backgroundColor: '#8E44AD',
  },
  sidebarItemText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  sidebarItemTextActive: {
    color: '#fff',
    fontWeight: '600',
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
