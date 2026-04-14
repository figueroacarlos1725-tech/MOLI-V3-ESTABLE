import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Switch,
  Modal,
  Alert,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import { apiService } from '@/src/services/api';
import { Button } from '@/src/components/Button';
import { Input } from '@/src/components/Input';

interface Vehicle {
  vehicle_id: string;
  make: string;
  model: string;
  year: number;
  color: string;
  plate_number: string;
  vehicle_type: string;
  is_active: boolean;
  documents_verified: boolean;
}

export default function DriverProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [newVehicle, setNewVehicle] = useState({
    make: '',
    model: '',
    year: '',
    color: '',
    plate_number: '',
    vehicle_type: 'economy',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchVehicles();
  }, []);

  const fetchVehicles = async () => {
    try {
      const response = await apiService.get('/vehicles');
      setVehicles(response.vehicles || []);
    } catch (error) {
      console.error('Error obteniendo vehiculos:', error);
    }
  };

  const handleAddVehicle = async () => {
    if (!newVehicle.make || !newVehicle.model || !newVehicle.year || !newVehicle.plate_number) {
      Alert.alert('Error', 'Por favor completa todos los campos requeridos');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiService.post('/vehicles', {
        ...newVehicle,
        year: parseInt(newVehicle.year),
        capacity: 4,
      });
      
      Alert.alert('Exito', 'Vehiculo agregado correctamente');
      setShowAddVehicleModal(false);
      setNewVehicle({ make: '', model: '', year: '', color: '', plate_number: '', vehicle_type: 'economy' });
      fetchVehicles();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo agregar el vehiculo');
    } finally {
      setIsSubmitting(false);
    }
  };

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const doLogout = async () => {
    try {
      await logout();
    } catch (e) {
      console.error('Logout error:', e);
    }
    // Force full page reload on web to clear all state
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    } else {
      router.replace('/');
    }
  };

  const vehicleTypes = [
    { id: 'economy', name: 'Economico' },
    { id: 'comfort', name: 'Confort' },
    { id: 'premium', name: 'Premium' },
    { id: 'xl', name: 'XL' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
            <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
          </TouchableOpacity>
          <Text style={styles.title}>Perfil</Text>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={40} color="#00C853" />
            </View>
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark" size={12} color="#fff" />
            </View>
          </View>
          <Text style={styles.userName}>{user?.name || 'Conductor'}</Text>
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
              <Text style={styles.statLabel}>Calificacion</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Mis vehiculos</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowAddVehicleModal(true)}
            >
              <Ionicons name="add" size={20} color="#00C853" />
              <Text style={styles.addButtonText}>Agregar</Text>
            </TouchableOpacity>
          </View>
          
          {vehicles.length > 0 ? (
            vehicles.map((vehicle) => (
              <View key={vehicle.vehicle_id} style={styles.vehicleCard}>
                <View style={styles.vehicleIcon}>
                  <Ionicons name="car-sport" size={28} color="#00C853" />
                </View>
                <View style={styles.vehicleInfo}>
                  <Text style={styles.vehicleName}>
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </Text>
                  <Text style={styles.vehicleDetails}>
                    {vehicle.color} - {vehicle.plate_number}
                  </Text>
                  <View style={styles.vehicleBadges}>
                    <View style={[styles.vehicleBadge, { backgroundColor: vehicle.is_active ? '#E8F5E9' : '#FFEBEE' }]}>
                      <Text style={[styles.vehicleBadgeText, { color: vehicle.is_active ? '#00C853' : '#FF3B30' }]}>
                        {vehicle.is_active ? 'Activo' : 'Inactivo'}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyVehicles}>
              <Ionicons name="car-outline" size={48} color="#E5E5EA" />
              <Text style={styles.emptyText}>Sin vehiculos agregados</Text>
              <Text style={styles.emptySubtext}>Agrega un vehiculo para empezar a aceptar viajes</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitleSmall}>AJUSTES</Text>
          <View style={styles.settingsCard}>
            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <Ionicons name="notifications-outline" size={22} color="#00C853" />
                <Text style={styles.settingText}>Notificaciones push</Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: '#E5E5EA', true: '#00C853' }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.menuCard}>
            <TouchableOpacity style={styles.menuItem}>
              <View style={styles.menuItemLeft}>
                <Ionicons name="document-text-outline" size={22} color="#00C853" />
                <Text style={styles.menuItemText}>Documentos</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/support')}>
              <View style={styles.menuItemLeft}>
                <Ionicons name="help-circle-outline" size={22} color="#00C853" />
                <Text style={styles.menuItemText}>Ayuda y soporte</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.logoutSection}>
          {showLogoutConfirm ? (
            <View style={{gap: 10}}>
              <Text style={{textAlign: 'center', fontSize: 15, color: '#EF4444', fontWeight: '600'}}>
                ¿Seguro que quieres cerrar sesion?
              </Text>
              <View style={{flexDirection: 'row', gap: 10}}>
                <TouchableOpacity 
                  style={{flex:1, backgroundColor:'#E5E5EA', paddingVertical:14, borderRadius:12, alignItems:'center'}}
                  onPress={() => setShowLogoutConfirm(false)}
                >
                  <Text style={{fontWeight:'600', color:'#666', fontSize:15}}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{flex:1, backgroundColor:'#EF4444', paddingVertical:14, borderRadius:12, alignItems:'center'}}
                  onPress={doLogout}
                >
                  <Text style={{fontWeight:'700', color:'#fff', fontSize:15}}>Si, salir</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity 
              style={{backgroundColor:'#EF4444', paddingVertical:14, borderRadius:12, alignItems:'center', flexDirection:'row', justifyContent:'center', gap:8}}
              onPress={() => setShowLogoutConfirm(true)}
            >
              <Ionicons name="log-out-outline" size={20} color="#fff" />
              <Text style={{fontWeight:'700', color:'#fff', fontSize:15}}>Cerrar sesion</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.versionText}>Moli Conductor v1.0.0</Text>

        {/* Legal links */}
        <View style={{ marginHorizontal: 16, marginBottom: 8, gap: 12 }}>
          <TouchableOpacity onPress={() => Linking.openURL(`${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/legal/privacy`)}>
            <Text style={{ color: '#007AFF', fontSize: 14, textAlign: 'center' }}>Política de privacidad</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL(`${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/legal/terms`)}>
            <Text style={{ color: '#007AFF', fontSize: 14, textAlign: 'center' }}>Términos y condiciones</Text>
          </TouchableOpacity>
        </View>

        {/* Eliminar cuenta */}
        <TouchableOpacity
          style={{ marginHorizontal: 16, marginBottom: 40, paddingVertical: 14, alignItems: 'center' }}
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
              Esta acción es irreversible. Se eliminarán todos tus datos personales, documentos y ganancias registradas.
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
                onPress={async () => {
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
                }}
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

      <Modal visible={showAddVehicleModal} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Agregar vehiculo</Text>
              <TouchableOpacity onPress={() => setShowAddVehicleModal(false)}>
                <Ionicons name="close" size={24} color="#1C1C1E" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Input label="Marca" placeholder="ej. Toyota" value={newVehicle.make} onChangeText={(v) => setNewVehicle({ ...newVehicle, make: v })} />
              <Input label="Modelo" placeholder="ej. Corolla" value={newVehicle.model} onChangeText={(v) => setNewVehicle({ ...newVehicle, model: v })} />
              <Input label="Ano" placeholder="ej. 2022" value={newVehicle.year} onChangeText={(v) => setNewVehicle({ ...newVehicle, year: v })} keyboardType="numeric" />
              <Input label="Color" placeholder="ej. Blanco" value={newVehicle.color} onChangeText={(v) => setNewVehicle({ ...newVehicle, color: v })} />
              <Input label="Placa" placeholder="ej. ABC-1234" value={newVehicle.plate_number} onChangeText={(v) => setNewVehicle({ ...newVehicle, plate_number: v })} />

              <Text style={styles.inputLabel}>Tipo de vehiculo</Text>
              <View style={styles.vehicleTypeSelector}>
                {vehicleTypes.map((type) => (
                  <TouchableOpacity
                    key={type.id}
                    style={[styles.vehicleTypeButton, newVehicle.vehicle_type === type.id && styles.vehicleTypeButtonActive]}
                    onPress={() => setNewVehicle({ ...newVehicle, vehicle_type: type.id })}
                  >
                    <Text style={[styles.vehicleTypeText, newVehicle.vehicle_type === type.id && styles.vehicleTypeTextActive]}>
                      {type.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Button title="Agregar vehiculo" onPress={handleAddVehicle} loading={isSubmitting} variant="secondary" style={styles.submitButton} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1C1C1E' },
  profileCard: { backgroundColor: '#fff', margin: 16, borderRadius: 20, padding: 24, alignItems: 'center' },
  avatarContainer: { position: 'relative', marginBottom: 16 },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' },
  verifiedBadge: { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: '#00C853', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#fff' },
  userName: { fontSize: 22, fontWeight: 'bold', color: '#1C1C1E' },
  userEmail: { fontSize: 14, color: '#8E8E93', marginTop: 4 },
  statsContainer: { flexDirection: 'row', marginTop: 24, paddingTop: 24, borderTopWidth: 1, borderTopColor: '#E5E5EA', width: '100%' },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: 'bold', color: '#1C1C1E' },
  statLabel: { fontSize: 13, color: '#8E8E93', marginTop: 4 },
  statDivider: { width: 1, backgroundColor: '#E5E5EA' },
  ratingContainer: { flexDirection: 'row', alignItems: 'center' },
  section: { marginHorizontal: 16, marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#1C1C1E' },
  sectionTitleSmall: { fontSize: 14, fontWeight: '600', color: '#8E8E93', marginBottom: 8, marginLeft: 4, textTransform: 'uppercase' },
  addButton: { flexDirection: 'row', alignItems: 'center' },
  addButtonText: { color: '#00C853', fontWeight: '600', marginLeft: 4 },
  vehicleCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, flexDirection: 'row', marginBottom: 12 },
  vehicleIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' },
  vehicleInfo: { flex: 1, marginLeft: 12 },
  vehicleName: { fontSize: 16, fontWeight: '600', color: '#1C1C1E' },
  vehicleDetails: { fontSize: 13, color: '#8E8E93', marginTop: 4 },
  vehicleBadges: { flexDirection: 'row', marginTop: 8, gap: 8 },
  vehicleBadge: { backgroundColor: '#F2F2F7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  vehicleBadgeText: { fontSize: 11, fontWeight: '600', color: '#8E8E93' },
  emptyVehicles: { backgroundColor: '#fff', borderRadius: 16, padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#1C1C1E', marginTop: 12 },
  emptySubtext: { fontSize: 13, color: '#8E8E93', marginTop: 4, textAlign: 'center' },
  settingsCard: { backgroundColor: '#fff', borderRadius: 16, padding: 4 },
  settingItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  settingLeft: { flexDirection: 'row', alignItems: 'center' },
  settingText: { fontSize: 16, color: '#1C1C1E', marginLeft: 12 },
  menuCard: { backgroundColor: '#fff', borderRadius: 16, padding: 4 },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  menuItemLeft: { flexDirection: 'row', alignItems: 'center' },
  menuItemText: { fontSize: 16, color: '#1C1C1E', marginLeft: 12 },
  menuDivider: { height: 1, backgroundColor: '#E5E5EA', marginLeft: 50 },
  logoutSection: { marginHorizontal: 16, marginTop: 8, marginBottom: 16 },
  versionText: { textAlign: 'center', fontSize: 12, color: '#8E8E93', marginBottom: 32 },
  modalContainer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1C1C1E' },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#1C1C1E', marginBottom: 8 },
  vehicleTypeSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  vehicleTypeButton: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#F2F2F7' },
  vehicleTypeButtonActive: { backgroundColor: '#00C853' },
  vehicleTypeText: { fontSize: 14, fontWeight: '600', color: '#8E8E93' },
  vehicleTypeTextActive: { color: '#fff' },
  submitButton: { marginBottom: 20 },
});
