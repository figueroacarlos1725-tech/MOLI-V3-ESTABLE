import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/src/services/api';

interface CustomPlace {
  place_id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  category: string;
  icon: string;
  keywords: string;
  is_active: boolean;
}

const PLACE_ICONS = ['📍', '🏥', '🏫', '🏪', '⛽', '🏟️', '🏛️', '🚏', '🏘️', '🌳', '🏗️', '🎯', '🅿️', '🍽️'];
const PLACE_CATEGORIES = ['Barrio', 'Hospital', 'Escuela', 'Comercio', 'Estación', 'Plaza', 'Parada', 'Zona', 'Otro'];

export default function AdminPlacesScreen() {
  const router = useRouter();
  const [places, setPlaces] = useState<CustomPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPlace, setEditingPlace] = useState<CustomPlace | null>(null);
  const [cacheStats, setCacheStats] = useState<any>(null);

  // Form state
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [category, setCategory] = useState('Barrio');
  const [icon, setIcon] = useState('📍');
  const [keywords, setKeywords] = useState('');

  const fetchPlaces = useCallback(async () => {
    try {
      const data = await apiService.get('/admin/places');
      setPlaces(data.places || []);
    } catch (e) {
      console.error('Error fetching places:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCacheStats = useCallback(async () => {
    try {
      const data = await apiService.get('/admin/cache/stats');
      setCacheStats(data);
    } catch (e) {
      console.error('Error fetching cache stats:', e);
    }
  }, []);

  useEffect(() => {
    fetchPlaces();
    fetchCacheStats();
  }, []);

  const resetForm = () => {
    setName(''); setAddress(''); setLat(''); setLng('');
    setCategory('Barrio'); setIcon('📍'); setKeywords('');
    setEditingPlace(null);
    setShowForm(false);
  };

  const openEditForm = (place: CustomPlace) => {
    setEditingPlace(place);
    setName(place.name);
    setAddress(place.address);
    setLat(String(place.latitude));
    setLng(String(place.longitude));
    setCategory(place.category);
    setIcon(place.icon);
    setKeywords(place.keywords);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !address.trim()) {
      Alert.alert('Error', 'Nombre y dirección son obligatorios');
      return;
    }

    const payload = {
      name: name.trim(),
      address: address.trim(),
      latitude: parseFloat(lat) || -28.4696,
      longitude: parseFloat(lng) || -65.7852,
      category,
      icon,
      keywords: keywords.trim(),
    };

    try {
      if (editingPlace) {
        await apiService.put(`/admin/places/${editingPlace.place_id}`, payload);
      } else {
        await apiService.post('/admin/places', payload);
      }
      resetForm();
      fetchPlaces();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo guardar');
    }
  };

  const handleDelete = async (placeId: string) => {
    if (Platform.OS === 'web') {
      if (!confirm('¿Eliminar este lugar?')) return;
    }
    try {
      await apiService.delete(`/admin/places/${placeId}`);
      fetchPlaces();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo eliminar');
    }
  };

  const handleToggleActive = async (place: CustomPlace) => {
    try {
      await apiService.put(`/admin/places/${place.place_id}`, {
        is_active: !place.is_active,
      });
      fetchPlaces();
    } catch (e: any) {
      console.error('Toggle error:', e);
    }
  };

  const handleClearCache = async () => {
    if (Platform.OS === 'web') {
      if (!confirm('¿Limpiar todo el cache de direcciones?')) return;
    }
    try {
      await apiService.delete('/admin/cache/clear');
      fetchCacheStats();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo limpiar');
    }
  };

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Text style={s.headerTitle}>Lugares y Cache</Text>
            <Text style={s.headerSub}>{places.length} lugares personalizados</Text>
          </View>
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => { resetForm(); setShowForm(true); }}
          >
            <Ionicons name="add" size={22} color="#000" />
          </TouchableOpacity>
        </View>

        <ScrollView style={s.content} showsVerticalScrollIndicator={false}>
          {/* Cache Stats Card */}
          {cacheStats && (
            <View style={s.cacheCard}>
              <View style={s.cacheHeader}>
                <View style={s.cacheIconBg}>
                  <Ionicons name="server-outline" size={20} color="#6BBF00" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cacheTitle}>Cache de Direcciones</Text>
                  <Text style={s.cacheSub}>Llamadas API ahorradas: {cacheStats.estimated_api_calls_saved}</Text>
                </View>
                <TouchableOpacity style={s.clearCacheBtn} onPress={handleClearCache}>
                  <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                </TouchableOpacity>
              </View>
              <View style={s.cacheStats}>
                <View style={s.cacheStat}>
                  <Text style={s.cacheStatNum}>{cacheStats.search_cache_entries}</Text>
                  <Text style={s.cacheStatLabel}>Búsquedas</Text>
                </View>
                <View style={s.cacheStatDivider} />
                <View style={s.cacheStat}>
                  <Text style={s.cacheStatNum}>{cacheStats.reverse_cache_entries}</Text>
                  <Text style={s.cacheStatLabel}>Geocodificaciones</Text>
                </View>
                <View style={s.cacheStatDivider} />
                <View style={s.cacheStat}>
                  <Text style={[s.cacheStatNum, { color: '#6BBF00' }]}>
                    {cacheStats.total_search_hits + cacheStats.total_reverse_hits}
                  </Text>
                  <Text style={s.cacheStatLabel}>Hits totales</Text>
                </View>
              </View>
            </View>
          )}

          {/* Add/Edit Form */}
          {showForm && (
            <View style={s.formCard}>
              <Text style={s.formTitle}>
                {editingPlace ? 'Editar lugar' : 'Nuevo lugar personalizado'}
              </Text>

              <Text style={s.label}>Nombre</Text>
              <TextInput
                style={s.input}
                value={name}
                onChangeText={setName}
                placeholder="Ej: Hospital Padilla"
                placeholderTextColor="#666"
              />

              <Text style={s.label}>Dirección</Text>
              <TextInput
                style={s.input}
                value={address}
                onChangeText={setAddress}
                placeholder="Ej: Av. Alem 550, Catamarca"
                placeholderTextColor="#666"
              />

              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>Latitud</Text>
                  <TextInput
                    style={s.input}
                    value={lat}
                    onChangeText={setLat}
                    placeholder="-28.4696"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={s.label}>Longitud</Text>
                  <TextInput
                    style={s.input}
                    value={lng}
                    onChangeText={setLng}
                    placeholder="-65.7852"
                    placeholderTextColor="#666"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Text style={s.label}>Categoría</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
                {PLACE_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[s.chip, category === cat && s.chipActive]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[s.chipText, category === cat && s.chipTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={s.label}>Ícono</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipRow}>
                {PLACE_ICONS.map(ic => (
                  <TouchableOpacity
                    key={ic}
                    style={[s.iconChip, icon === ic && s.iconChipActive]}
                    onPress={() => setIcon(ic)}
                  >
                    <Text style={{ fontSize: 22 }}>{ic}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={s.label}>Palabras clave (separadas por coma)</Text>
              <TextInput
                style={s.input}
                value={keywords}
                onChangeText={setKeywords}
                placeholder="hospital, salud, emergencia"
                placeholderTextColor="#666"
              />

              <View style={s.formActions}>
                <TouchableOpacity style={s.cancelBtn} onPress={resetForm}>
                  <Text style={s.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
                  <Ionicons name="checkmark" size={18} color="#000" />
                  <Text style={s.saveBtnText}>Guardar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Places List */}
          <Text style={s.sectionTitle}>Lugares personalizados</Text>
          <Text style={s.sectionSub}>Aparecen primero en los resultados de búsqueda del pasajero</Text>

          {loading ? (
            <ActivityIndicator size="large" color="#6BBF00" style={{ marginTop: 30 }} />
          ) : places.length === 0 ? (
            <View style={s.emptyState}>
              <Ionicons name="location-outline" size={48} color="#333" />
              <Text style={s.emptyText}>No hay lugares personalizados</Text>
              <Text style={s.emptySubtext}>Agregá barrios, hospitales, paradas o cualquier punto de interés</Text>
            </View>
          ) : (
            places.map(place => (
              <View key={place.place_id} style={[s.placeCard, !place.is_active && s.placeCardInactive]}>
                <View style={s.placeIcon}>
                  <Text style={{ fontSize: 24 }}>{place.icon || '📍'}</Text>
                </View>
                <View style={s.placeInfo}>
                  <Text style={s.placeName}>{place.name}</Text>
                  <Text style={s.placeAddress} numberOfLines={1}>{place.address}</Text>
                  <View style={s.placeTags}>
                    <View style={s.placeTag}>
                      <Text style={s.placeTagText}>{place.category || 'Otro'}</Text>
                    </View>
                    {!place.is_active && (
                      <View style={[s.placeTag, { borderColor: 'rgba(255,59,48,0.3)' }]}>
                        <Text style={[s.placeTagText, { color: '#FF3B30' }]}>Inactivo</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={s.placeActions}>
                  <TouchableOpacity
                    style={s.placeActionBtn}
                    onPress={() => handleToggleActive(place)}
                  >
                    <Ionicons
                      name={place.is_active ? 'eye-outline' : 'eye-off-outline'}
                      size={18}
                      color={place.is_active ? '#6BBF00' : '#FF3B30'}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.placeActionBtn}
                    onPress={() => openEditForm(place)}
                  >
                    <Ionicons name="pencil-outline" size={18} color="#007AFF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.placeActionBtn}
                    onPress={() => handleDelete(place.place_id)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: '500' },
  addBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#6BBF00', justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, paddingHorizontal: 16 },

  // Cache
  cacheCard: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  cacheHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  cacheIconBg: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(107,191,0,0.12)', justifyContent: 'center', alignItems: 'center' },
  cacheTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  cacheSub: { fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: '500' },
  clearCacheBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(255,59,48,0.1)', justifyContent: 'center', alignItems: 'center' },
  cacheStats: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  cacheStat: { alignItems: 'center', flex: 1 },
  cacheStatNum: { fontSize: 22, fontWeight: '900', color: '#fff' },
  cacheStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: '500', marginTop: 2 },
  cacheStatDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.08)' },

  // Form
  formCard: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(107,191,0,0.2)' },
  formTitle: { fontSize: 16, fontWeight: '800', color: '#fff', marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.5)', marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  row: { flexDirection: 'row' },
  chipRow: { flexDirection: 'row', marginBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', marginRight: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  chipActive: { backgroundColor: 'rgba(107,191,0,0.12)', borderColor: 'rgba(107,191,0,0.3)' },
  chipText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  chipTextActive: { color: '#6BBF00' },
  iconChip: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', marginRight: 8, borderWidth: 2, borderColor: 'transparent' },
  iconChipActive: { borderColor: '#6BBF00', backgroundColor: 'rgba(107,191,0,0.1)' },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center' },
  cancelBtnText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' },
  saveBtn: { flex: 2, flexDirection: 'row', paddingVertical: 14, borderRadius: 14, backgroundColor: '#6BBF00', alignItems: 'center', justifyContent: 'center', gap: 6 },
  saveBtnText: { color: '#000', fontSize: 14, fontWeight: '800' },

  // Section
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#fff', marginTop: 8, marginBottom: 2 },
  sectionSub: { fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 14 },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#444' },
  emptySubtext: { fontSize: 13, color: '#555', textAlign: 'center' },

  // Place card
  placeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  placeCardInactive: { opacity: 0.5 },
  placeIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  placeInfo: { flex: 1 },
  placeName: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 2 },
  placeAddress: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 4 },
  placeTags: { flexDirection: 'row', gap: 6 },
  placeTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  placeTagText: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.4)' },
  placeActions: { gap: 4 },
  placeActionBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)', justifyContent: 'center', alignItems: 'center' },
});
