import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';

type MenuItem = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route?: string;
  onPress?: () => void;
  badge?: number;
  color?: string;
};

interface SideMenuProps {
  visible: boolean;
  onClose: () => void;
  role: 'rider' | 'driver';
}

export default function SideMenu({ visible, onClose, role }: SideMenuProps) {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const riderItems: MenuItem[] = [
    { icon: 'home', label: 'Inicio', route: '/modules' },
    { icon: 'car', label: 'Mis Viajes', route: '/(rider)/rides' },
    { icon: 'wallet', label: 'Billetera', route: '/(rider)/wallet' },
    { icon: 'person', label: 'Mi Perfil', route: '/(rider)/profile' },
  ];

  const driverItems: MenuItem[] = [
    { icon: 'home', label: 'Inicio', route: '/(driver)/home' },
    { icon: 'list', label: 'Solicitudes', route: '/(driver)/rides' },
    { icon: 'wallet', label: 'Billetera', route: '/(driver)/earnings' },
    { icon: 'mail', label: 'Bandeja de entrada', route: '/(driver)/inbox' },
    { icon: 'document-text', label: 'Mis Documentos', route: '/(driver)/documents' },
    { icon: 'speedometer', label: 'Taxímetro', route: '/(driver)/taximeter' },
    { icon: 'briefcase', label: 'Moli Trabajos', route: '/(jobs)/home' },
    { icon: 'person', label: 'Mi Perfil', route: '/(driver)/profile' },
  ];

  const items = role === 'rider' ? riderItems : driverItems;

  const navigateTo = (route: string) => {
    onClose();
    setTimeout(() => {
      router.push(route as any);
    }, 200);
  };

  const handleLogout = () => {
    onClose();
    logout();
    router.replace('/(auth)/login');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={styles.menu}>
          <SafeAreaView style={{ flex: 1 }}>
            {/* Profile header */}
            <View style={styles.profileHeader}>
              <View style={styles.avatarCircle}>
                <Ionicons name="person" size={32} color="#fff" />
              </View>
              <Text style={styles.userName}>{user?.name || 'Usuario'}</Text>
              <Text style={styles.userEmail}>{user?.email || ''}</Text>
              <View style={styles.ratingBadge}>
                <Ionicons name="star" size={14} color="#FFD700" />
                <Text style={styles.ratingText}>{(user?.rating || 5).toFixed(1)}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            {/* Menu items */}
            <ScrollView style={styles.menuItems} showsVerticalScrollIndicator={false}>
              {items.map((item, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.menuItem}
                  onPress={() => item.route ? navigateTo(item.route) : item.onPress?.()}
                >
                  <View style={styles.menuIconWrap}>
                    <Ionicons name={item.icon} size={22} color={item.color || '#1C1C1E'} />
                  </View>
                  <Text style={[styles.menuLabel, item.color ? { color: item.color } : null]}>{item.label}</Text>
                  {item.badge ? (
                    <View style={styles.badge}><Text style={styles.badgeText}>{item.badge}</Text></View>
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.divider} />

            {/* Logout */}
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={22} color="#FF3B30" />
              <Text style={styles.logoutText}>Cerrar sesión</Text>
            </TouchableOpacity>

            <Text style={styles.version}>Moli v1.0</Text>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  menu: {
    width: 300,
    backgroundColor: '#fff',
    flex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  profileHeader: {
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 8 : 24,
    alignItems: 'center',
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  userName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  userEmail: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 4,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F8FA',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
    gap: 4,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  divider: {
    height: 1,
    backgroundColor: '#F2F2F7',
    marginHorizontal: 20,
  },
  menuItems: {
    flex: 1,
    paddingVertical: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  menuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  badge: {
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 14,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF3B30',
  },
  version: {
    textAlign: 'center',
    fontSize: 12,
    color: '#C7C7CC',
    paddingBottom: 16,
  },
});
