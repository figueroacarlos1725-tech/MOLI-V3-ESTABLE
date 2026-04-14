import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  Modal,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import { apiService } from '@/src/services/api';

export default function RiderProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const doLogout = async () => {
    try {
      await logout();
    } catch (e) {
      console.error('Logout error:', e);
    }
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    } else {
      router.replace('/');
    }
  };

  const openLegalPage = (page: string) => {
    const url = `${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/legal/${page}`;
    Linking.openURL(url).catch(() => {});
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await apiService.delete('/auth/delete-account?confirmation=ELIMINAR');
      Alert.alert('Cuenta eliminada', 'Tu cuenta ha sido eliminada exitosamente.');
      await logout();
      router.replace('/');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo eliminar la cuenta');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const menuItems = [
    {
      icon: 'person-outline',
      title: 'Editar perfil',
      onPress: () => {},
    },
    {
      icon: 'location-outline',
      title: 'Lugares guardados',
      onPress: () => {},
    },
    {
      icon: 'cash-outline',
      title: 'Métodos de pago',
      subtitle: 'Efectivo',
      onPress: () => Alert.alert('Métodos de pago', 'Actualmente solo está disponible el pago en efectivo. Próximamente más opciones.'),
    },
    {
      icon: 'help-circle-outline',
      title: 'Ayuda y soporte',
      onPress: () => router.push('/support'),
    },
    {
      icon: 'shield-outline',
      title: 'Política de privacidad',
      onPress: () => openLegalPage('privacy'),
    },
    {
      icon: 'document-text-outline',
      title: 'Términos de servicio',
      onPress: () => openLegalPage('terms'),
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Encabezado */}
        <View style={styles.header}>
          <Text style={styles.title}>Perfil</Text>
        </View>

        {/* Tarjeta de perfil */}
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={40} color="#007AFF" />
            </View>
            <TouchableOpacity style={styles.editAvatarButton}>
              <Ionicons name="camera" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
          <Text style={styles.userName}>{user?.name || 'Usuario'}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{user?.total_rides || 0}</Text>
              <Text style={styles.statLabel}>Viajes</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={styles.ratingContainer}>
                <Ionicons name="star" size={16} color="#FFD700" />
                <Text style={styles.statValue}>{user?.rating?.toFixed(1) || '5.0'}</Text>
              </View>
              <Text style={styles.statLabel}>Calificación</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>${user?.wallet_balance?.toFixed(0) || 0}</Text>
              <Text style={styles.statLabel}>Saldo</Text>
            </View>
          </View>
        </View>

        {/* Configuraciones */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Configuración</Text>
          <View style={styles.settingsCard}>
            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <Ionicons name="notifications-outline" size={22} color="#007AFF" />
                <Text style={styles.settingText}>Notificaciones push</Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: '#E5E5EA', true: '#34C759' }}
                thumbColor="#fff"
              />
            </View>
            <View style={styles.settingDivider} />
            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <Ionicons name="moon-outline" size={22} color="#007AFF" />
                <Text style={styles.settingText}>Modo oscuro</Text>
              </View>
              <Switch
                value={darkMode}
                onValueChange={setDarkMode}
                trackColor={{ false: '#E5E5EA', true: '#34C759' }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </View>

        {/* Items del menú */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cuenta</Text>
          <View style={styles.menuCard}>
            {menuItems.map((item, index) => (
              <React.Fragment key={item.title}>
                <TouchableOpacity style={styles.menuItem} onPress={item.onPress}>
                  <View style={styles.menuItemLeft}>
                    <Ionicons name={item.icon as any} size={22} color="#007AFF" />
                    <Text style={styles.menuItemText}>{item.title}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
                </TouchableOpacity>
                {index < menuItems.length - 1 && <View style={styles.menuDivider} />}
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* Botón de cerrar sesión */}
        <View style={styles.logoutSection}>
          {showLogoutConfirm ? (
            <View style={{ gap: 10 }}>
              <Text style={{ textAlign: 'center', fontSize: 15, color: '#EF4444', fontWeight: '600' }}>
                ¿Seguro que quieres cerrar sesión?
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#E5E5EA', paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
                  onPress={() => setShowLogoutConfirm(false)}
                >
                  <Text style={{ fontWeight: '600', color: '#666', fontSize: 15 }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#EF4444', paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
                  onPress={doLogout}
                >
                  <Text style={{ fontWeight: '700', color: '#fff', fontSize: 15 }}>Sí, salir</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={{ backgroundColor: '#EF4444', paddingVertical: 14, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
              onPress={() => setShowLogoutConfirm(true)}
            >
              <Ionicons name="log-out-outline" size={20} color="#fff" />
              <Text style={{ fontWeight: '700', color: '#fff', fontSize: 15 }}>Cerrar sesión</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Versión */}
        <Text style={styles.versionText}>Moli Pasajero v1.0.0</Text>

        {/* Eliminar cuenta */}
        <TouchableOpacity
          style={{ marginHorizontal: 20, marginBottom: 40, paddingVertical: 14, alignItems: 'center' }}
          onPress={() => setShowDeleteConfirm(true)}
        >
          <Text style={{ color: '#FF3B30', fontSize: 14, fontWeight: '600' }}>Eliminar mi cuenta</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Modal eliminar cuenta */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 360, alignItems: 'center' }}>
            <Ionicons name="warning-outline" size={48} color="#FF3B30" />
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#1C1C1E', marginTop: 12, textAlign: 'center' }}>
              Eliminar cuenta
            </Text>
            <Text style={{ fontSize: 14, color: '#636366', textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
              Esta acción es irreversible. Se eliminarán todos tus datos personales, historial de viajes y ubicaciones guardadas.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20, width: '100%' }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#E5E5EA', paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
                onPress={() => setShowDeleteConfirm(false)}
              >
                <Text style={{ fontWeight: '600', color: '#666', fontSize: 15 }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#FF3B30', paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
                onPress={handleDeleteAccount}
                disabled={deleting}
              >
                <Text style={{ fontWeight: '700', color: '#fff', fontSize: 15 }}>
                  {deleting ? 'Eliminando...' : 'Eliminar'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  profileCard: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  userName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  userEmail: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  statLabel: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: '100%',
    backgroundColor: '#E5E5EA',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  settingsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 4,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingText: {
    fontSize: 16,
    color: '#1C1C1E',
    marginLeft: 12,
  },
  settingDivider: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginLeft: 50,
  },
  menuCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemText: {
    fontSize: 16,
    color: '#1C1C1E',
    marginLeft: 12,
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginLeft: 50,
  },
  logoutSection: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 32,
  },
});
