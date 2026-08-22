import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/src/services/api';
import { useAuthStore } from '@/src/stores/authStore';
import { useRouter } from 'expo-router';
import { confirmAlert } from '@/src/utils/alert';

interface Settings {
  map_provider: string;
  base_fare: number;
  per_km_rate: number;
  per_minute_rate: number;
  commission_rate: number;
  currency: string;
  google_maps_key?: string;
  mapbox_key?: string;
  mercadopago_public_key?: string;
  mercadopago_access_token?: string;
  astropay_api_key?: string;
  astropay_secret_key?: string;
  firebase_server_key?: string;
  firebase_project_id?: string;
  cancel_free_minutes?: number;
  rider_cancel_penalty?: number;
  driver_cancel_penalty?: number;
  driver_max_negative_balance?: number;
  driver_block_after_cancels?: number;
  driver_block_hours?: number;
  rider_max_pending_penalties?: number;
  min_app_version?: string;
  update_message?: string;
  trabajos_mode?: string;
  first_ride_discount?: number;
  banner_interval_seconds?: number;
  broadcast_enabled?: boolean;
  broadcast_after_rounds?: number;
}

// Track which sensitive fields the user has actually edited
const SENSITIVE_KEYS = ['google_maps_key', 'mapbox_key', 'mercadopago_public_key', 'mercadopago_access_token', 'astropay_api_key', 'astropay_secret_key', 'firebase_server_key'];

export default function AdminSettingsScreen() {
  const router = useRouter();
  const { logout } = useAuthStore();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<Partial<Settings>>({});
  const [editedSensitiveKeys, setEditedSensitiveKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await apiService.get('/admin/settings');
      setSettings(response);
      setFormData(response);
      setEditedSensitiveKeys(new Set());
    } catch (error) {
      console.error('Error obteniendo configuracion:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      // Build payload excluding sensitive keys that weren't actually edited
      const payload: any = {};
      for (const [key, value] of Object.entries(formData)) {
        if (SENSITIVE_KEYS.includes(key)) {
          // Only include if the user actually edited this field
          if (editedSensitiveKeys.has(key) && value && !String(value).startsWith('****')) {
            payload[key] = value;
          }
        } else if (value !== undefined && value !== null) {
          // Convert numeric fields
          if (['base_fare', 'per_km_rate', 'per_minute_rate', 'commission_rate', 'rider_cancel_penalty', 'driver_cancel_penalty', 'driver_max_negative_balance'].includes(key)) {
            payload[key] = parseFloat(String(value)) || 0;
          } else if (['cancel_free_minutes', 'driver_block_after_cancels', 'driver_block_hours', 'rider_max_pending_penalties'].includes(key)) {
            payload[key] = parseInt(String(value)) || 0;
          } else {
            payload[key] = value;
          }
        }
      }

      await apiService.put('/admin/settings', payload);
      Alert.alert('Guardado', 'Configuracion actualizada correctamente');
      setEditMode(false);
      fetchSettings();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo guardar');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    confirmAlert(
      'Cerrar sesion',
      'Estas seguro?',
      async () => {
        try {
          await logout();
          if (typeof window !== 'undefined') window.location.href = '/';
          else router.replace('/');
        } catch (e) {}
      },
      'Cerrar sesion'
    );
  };

  const updateField = (key: string, value: string) => {
    setFormData({ ...formData, [key]: value });
    if (SENSITIVE_KEYS.includes(key)) {
      setEditedSensitiveKeys(prev => new Set(prev).add(key));
    }
  };

  const renderField = (label: string, key: keyof Settings, opts?: { placeholder?: string; secure?: boolean; numeric?: boolean }) => {
    const value = editMode ? formData[key] : settings?.[key];
    const displayValue = opts?.secure && !editMode && value
      ? (String(value).startsWith('****') ? String(value) : '****' + String(value).slice(-4))
      : String(value ?? '');
    const isConfigured = value && !String(value).startsWith('****') && String(value) !== 'No configurado' && String(value) !== '';
    const wasMasked = opts?.secure && String(value ?? '').startsWith('****');

    return (
      <View style={s.fieldRow}>
        <View style={s.fieldLabelRow}>
          <Text style={s.fieldLabel}>{label}</Text>
          {opts?.secure && !editMode && (
            <View style={[s.statusDot, { backgroundColor: isConfigured || wasMasked ? '#34C759' : '#FF3B30' }]} />
          )}
        </View>
        {editMode ? (
          <TextInput
            style={s.fieldInput}
            value={editedSensitiveKeys.has(key) ? String(formData[key] ?? '') : (opts?.secure && wasMasked ? '' : String(formData[key] ?? ''))}
            onChangeText={(v) => updateField(key, v)}
            placeholder={opts?.secure && wasMasked ? 'Dejar vacio para mantener actual' : (opts?.placeholder || '')}
            placeholderTextColor="#666"
            secureTextEntry={false}
            keyboardType={opts?.numeric ? 'numeric' : 'default'}
          />
        ) : (
          <Text style={s.fieldValue} numberOfLines={1}>
            {displayValue || 'No configurado'}
          </Text>
        )}
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={s.container}>
        <ActivityIndicator size="large" color="#FF5A3C" style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#1C1C1E" />
          </TouchableOpacity>
          <Text style={s.title}>Ajustes</Text>
          <TouchableOpacity
            style={[s.editBtn, editMode && s.editBtnSave]}
            onPress={() => editMode ? handleSaveSettings() : setEditMode(true)}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name={editMode ? 'checkmark' : 'pencil'} size={16} color="#fff" />
                <Text style={s.editBtnText}>{editMode ? 'Guardar' : 'Editar'}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Maps */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="map-outline" size={18} color="#FF5A3C" />
              <Text style={s.sectionTitle}>Mapas</Text>
            </View>
            <View style={s.card}>
              <View style={s.fieldRow}>
                <Text style={s.fieldLabel}>Proveedor</Text>
                <View style={s.providerRow}>
                  {['osm', 'google', 'mapbox'].map((p) => (
                    <TouchableOpacity
                      key={p}
                      style={[s.providerBtn, (editMode ? formData.map_provider : settings?.map_provider) === p && s.providerBtnActive]}
                      onPress={() => editMode && setFormData({ ...formData, map_provider: p })}
                      disabled={!editMode}
                    >
                      <Text style={[s.providerBtnText, (editMode ? formData.map_provider : settings?.map_provider) === p && s.providerBtnTextActive]}>
                        {p.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              {renderField('API Key Google Maps', 'google_maps_key', { placeholder: 'AIzaSy...', secure: true })}
              {renderField('API Key Mapbox', 'mapbox_key', { placeholder: 'pk.eyJ...', secure: true })}
            </View>
          </View>

          {/* Fares */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="cash-outline" size={18} color="#FF9500" />
              <Text style={s.sectionTitle}>Tarifas</Text>
            </View>
            <View style={s.card}>
              {renderField('Tarifa base ($)', 'base_fare', { placeholder: '2.50', numeric: true })}
              {renderField('Tarifa por KM ($)', 'per_km_rate', { placeholder: '1.20', numeric: true })}
              {renderField('Tarifa por tiempo de espera ($)', 'per_minute_rate', { placeholder: '0.15', numeric: true })}
              {renderField('Comision (%)', 'commission_rate', { placeholder: '0.20', numeric: true })}
              {renderField('Moneda', 'currency', { placeholder: 'ARS' })}
            </View>
          </View>

          {/* Payments */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="card-outline" size={18} color="#007AFF" />
              <Text style={s.sectionTitle}>Pagos</Text>
            </View>
            <View style={s.card}>
              <Text style={s.cardSubtitle}>MercadoPago</Text>
              {renderField('Clave publica', 'mercadopago_public_key', { placeholder: 'APP_USR-...', secure: true })}
              {renderField('Token de acceso', 'mercadopago_access_token', { placeholder: 'APP_USR-...', secure: true })}
              <View style={s.divider} />
              <Text style={s.cardSubtitle}>AstroPay</Text>
              {renderField('API Key', 'astropay_api_key', { placeholder: 'Ingresa API key', secure: true })}
              {renderField('Clave secreta', 'astropay_secret_key', { placeholder: 'Ingresa clave secreta', secure: true })}
            </View>
          </View>

          {/* Push Notifications */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="notifications-outline" size={18} color="#34C759" />
              <Text style={s.sectionTitle}>Notificaciones Push</Text>
            </View>
            <View style={s.card}>
              <Text style={s.cardSubtitle}>Firebase Cloud Messaging</Text>
              {renderField('Server Key', 'firebase_server_key', { placeholder: 'AAAA...', secure: true })}
              {renderField('Project ID', 'firebase_project_id', { placeholder: 'my-project-12345' })}
            </View>
          </View>

          {/* Cancellations */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="close-circle-outline" size={18} color="#FF3B30" />
              <Text style={s.sectionTitle}>Cancelaciones y Multas</Text>
            </View>
            <View style={s.card}>
              {renderField('Tiempo gratis para cancelar (min)', 'cancel_free_minutes', { placeholder: '1', numeric: true })}
              <View style={s.divider} />
              <Text style={s.cardSubtitle}>Pasajero</Text>
              {renderField('Multa por cancelacion ($)', 'rider_cancel_penalty', { placeholder: '500', numeric: true })}
              {renderField('Max multas pendientes', 'rider_max_pending_penalties', { placeholder: '2', numeric: true })}
              <View style={s.divider} />
              <Text style={s.cardSubtitle}>Conductor</Text>
              {renderField('Multa por cancelacion ($)', 'driver_cancel_penalty', { placeholder: '500', numeric: true })}
              {renderField('Cancelaciones antes de bloqueo', 'driver_block_after_cancels', { placeholder: '3', numeric: true })}
              {renderField('Horas de bloqueo (0=permanente)', 'driver_block_hours', { placeholder: '24', numeric: true })}
              {renderField('Saldo negativo maximo ($)', 'driver_max_negative_balance', { placeholder: '-15000', numeric: true })}
              {renderField('Descuento primer viaje (%)', 'first_ride_discount', { placeholder: '10', numeric: true })}
              {renderField('Intervalo banners (segundos)', 'banner_interval_seconds', { placeholder: '90', numeric: true })}
            </View>
          </View>

          {/* Moli Trabajos */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="construct-outline" size={18} color="#007AFF" />
              <Text style={s.sectionTitle}>Moli Trabajos</Text>
            </View>
            <View style={s.card}>
              <View style={s.fieldRow}>
                <Text style={s.fieldLabel}>Modo del módulo</Text>
                <View style={s.providerRow}>
                  {[{ key: 'mvp', label: 'MVP (Demo)' }, { key: 'real', label: 'Real' }].map((m) => (
                    <TouchableOpacity
                      key={m.key}
                      style={[s.providerBtn, (editMode ? formData.trabajos_mode : settings?.trabajos_mode) === m.key && s.providerBtnActive]}
                      onPress={() => editMode && setFormData({ ...formData, trabajos_mode: m.key })}
                      disabled={!editMode}
                    >
                      <Text style={[s.providerBtnText, (editMode ? formData.trabajos_mode : settings?.trabajos_mode) === m.key && s.providerBtnTextActive]}>
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={{ paddingVertical: 8 }}>
                <Text style={{ fontSize: 12, color: '#8E8E93', lineHeight: 17 }}>
                  {(editMode ? formData.trabajos_mode : settings?.trabajos_mode) === 'real'
                    ? 'Modo Real: Los usuarios pueden publicar y aceptar trabajos reales.'
                    : 'Modo MVP: Se muestran trabajos de ejemplo para demostración.'}
                </Text>
              </View>
            </View>
          </View>

          {/* Broadcast / Modo Auxilio */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="megaphone-outline" size={18} color="#FF9500" />
              <Text style={s.sectionTitle}>Modo Auxilio (Broadcast)</Text>
            </View>
            <View style={s.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#1C1C1E' }}>Activar modo auxilio</Text>
                  <Text style={{ fontSize: 11, color: '#8E8E93', marginTop: 2 }}>Buscar todos los conductores cuando no hay cercanos</Text>
                </View>
                <TouchableOpacity
                  style={{ width: 52, height: 30, borderRadius: 15, backgroundColor: (editMode ? formData.broadcast_enabled : settings?.broadcast_enabled) !== false ? '#FF5A3C' : '#E5E5EA', justifyContent: 'center', padding: 2 }}
                  onPress={() => editMode && setFormData({ ...formData, broadcast_enabled: formData.broadcast_enabled === false ? true : false })}
                >
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff', alignSelf: (editMode ? formData.broadcast_enabled : settings?.broadcast_enabled) !== false ? 'flex-end' : 'flex-start' }} />
                </TouchableOpacity>
              </View>
              {renderField('Rondas antes de broadcast (0 = siempre)', 'broadcast_after_rounds', { placeholder: '3', numeric: true })}
              <Text style={{ fontSize: 11, color: '#8E8E93', paddingHorizontal: 16, paddingBottom: 12 }}>
                Si es 0: envia a todos los conductores desde el inicio.{'\n'}
                Si es 3: despues de 3 rondas sin aceptacion, envia a todos.
              </Text>
            </View>
          </View>

          {/* App Version */}
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Ionicons name="phone-portrait-outline" size={18} color="#5856D6" />
              <Text style={s.sectionTitle}>Version de la App</Text>
            </View>
            <View style={s.card}>
              {renderField('Version minima requerida', 'min_app_version', { placeholder: '1.0.0' })}
              {renderField('Mensaje de actualizacion', 'update_message', { placeholder: 'Hay una nueva version disponible...' })}
            </View>
          </View>

          {/* Account */}
          <View style={s.section}>
            <TouchableOpacity style={[s.logoutBtn, { backgroundColor: '#FFF0EC', marginBottom: 10 }]} onPress={() => router.push('/(admin)/verification')}>
              <Ionicons name="shield-checkmark" size={20} color="#FF5A3C" />
              <Text style={[s.logoutText, { color: '#FF5A3C' }]}>Revisar registros y capacidades pendientes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
              <Text style={s.logoutText}>Cerrar sesion</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.versionText}>Moli Admin v1.0.0</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E5EA', gap: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' },
  title: { flex: 1, fontSize: 22, fontWeight: '800', color: '#1C1C1E' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: '#FF5A3C', borderRadius: 20 },
  editBtnSave: { backgroundColor: '#34C759' },
  editBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  section: { paddingHorizontal: 16, marginTop: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, marginLeft: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#8E8E93', textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  cardSubtitle: { fontSize: 15, fontWeight: '700', color: '#1C1C1E', marginBottom: 4, marginTop: 4 },
  divider: { height: 1, backgroundColor: '#E5E5EA', marginVertical: 12 },
  fieldRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E5EA' },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  fieldLabel: { fontSize: 13, color: '#8E8E93', fontWeight: '500' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  fieldValue: { fontSize: 16, color: '#1C1C1E', fontWeight: '500' },
  fieldInput: { fontSize: 16, color: '#1C1C1E', backgroundColor: '#F2F2F7', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: '#E5E5EA' },
  providerRow: { flexDirection: 'row', gap: 8 },
  providerBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F2F2F7' },
  providerBtnActive: { backgroundColor: '#FF5A3C' },
  providerBtnText: { fontSize: 12, fontWeight: '700', color: '#8E8E93' },
  providerBtnTextActive: { color: '#fff' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 12 },
  logoutText: { fontSize: 16, color: '#FF3B30', fontWeight: '600' },
  versionText: { textAlign: 'center', fontSize: 12, color: '#8E8E93', marginVertical: 24 },
});
