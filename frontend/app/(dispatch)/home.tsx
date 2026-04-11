import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Dimensions,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import { apiService } from '@/src/services/api';

const { width } = Dimensions.get('window');

type TabKey = 'new' | 'active' | 'completed' | 'cancelled';

const TABS: { key: TabKey; label: string; icon: string; color: string }[] = [
  { key: 'new', label: 'Nuevos pedidos', icon: 'add-circle', color: '#FF9500' },
  { key: 'active', label: 'En curso', icon: 'car', color: '#34C759' },
  { key: 'completed', label: 'Terminados', icon: 'checkmark-circle', color: '#007AFF' },
  { key: 'cancelled', label: 'Cancelados', icon: 'close-circle', color: '#FF3B30' },
];

interface DispatchRide {
  request_id?: string;
  ride_id?: string;
  status?: string;
  pickup_location?: any;
  dropoff_location?: any;
  rider_id?: string;
  driver_id?: string;
  driver_name?: string;
  estimated_fare?: number;
  fare?: number;
  vehicle_type?: string;
  created_at?: string;
  current_offer_driver?: string;
  offer_index?: number;
  rider_name?: string;
  rider_phone?: string;
}

export default function DispatchHome() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabKey>('new');
  const [rides, setRides] = useState<DispatchRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [counts, setCounts] = useState({ new: 0, active: 0, completed: 0, cancelled: 0 });
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [newOrder, setNewOrder] = useState({
    rider_name: '', rider_phone: '', pickup_address: '', dropoff_address: '',
    vehicle_type: 'economy', notes: '', trip_type: 'full' as 'full' | 'taximeter',
    pickup_latitude: -28.4696, pickup_longitude: -65.7852,
    dropoff_latitude: -28.4750, dropoff_longitude: -65.7900,
  });
  const [creating, setCreating] = useState(false);
  const [pickupSuggestions, setPickupSuggestions] = useState<any[]>([]);
  const [dropoffSuggestions, setDropoffSuggestions] = useState<any[]>([]);
  const [searchingPickup, setSearchingPickup] = useState(false);
  const [searchingDropoff, setSearchingDropoff] = useState(false);

  // Debounced address search
  const searchAddress = useCallback(async (query: string, type: 'pickup' | 'dropoff') => {
    if (query.length < 3) {
      type === 'pickup' ? setPickupSuggestions([]) : setDropoffSuggestions([]);
      return;
    }
    type === 'pickup' ? setSearchingPickup(true) : setSearchingDropoff(true);
    try {
      const data = await apiService.get(`/places/search?q=${encodeURIComponent(query)}&lat=-28.4696&lng=-65.7852`);
      const results = data?.results || [];
      type === 'pickup' ? setPickupSuggestions(results) : setDropoffSuggestions(results);
    } catch { }
    type === 'pickup' ? setSearchingPickup(false) : setSearchingDropoff(false);
  }, []);

  // Debounce timer refs
  const pickupTimerRef = React.useRef<any>(null);
  const dropoffTimerRef = React.useRef<any>(null);

  const onPickupTextChange = (text: string) => {
    setNewOrder(prev => ({ ...prev, pickup_address: text }));
    if (pickupTimerRef.current) clearTimeout(pickupTimerRef.current);
    pickupTimerRef.current = setTimeout(() => searchAddress(text, 'pickup'), 400);
  };

  const onDropoffTextChange = (text: string) => {
    setNewOrder(prev => ({ ...prev, dropoff_address: text }));
    if (dropoffTimerRef.current) clearTimeout(dropoffTimerRef.current);
    dropoffTimerRef.current = setTimeout(() => searchAddress(text, 'dropoff'), 400);
  };

  const selectSuggestion = (item: any, type: 'pickup' | 'dropoff') => {
    if (type === 'pickup') {
      setNewOrder(prev => ({
        ...prev,
        pickup_address: item.address || item.name,
        pickup_latitude: item.latitude,
        pickup_longitude: item.longitude,
      }));
      setPickupSuggestions([]);
    } else {
      setNewOrder(prev => ({
        ...prev,
        dropoff_address: item.address || item.name,
        dropoff_latitude: item.latitude,
        dropoff_longitude: item.longitude,
      }));
      setDropoffSuggestions([]);
    }
  };

  const handleCreateOrder = async () => {
    if (!newOrder.rider_name && !newOrder.rider_phone) {
      Alert.alert('Error', 'Ingresá nombre o teléfono del pasajero');
      return;
    }
    if (!newOrder.pickup_address) {
      Alert.alert('Error', 'Ingresá la dirección de recogida');
      return;
    }
    setCreating(true);
    try {
      const isTaximeter = newOrder.trip_type === 'taximeter';
      const payload: any = {
        trip_type: isTaximeter ? 'destination_only' : 'full',
        rider_name: newOrder.rider_name || 'Cliente telefónico',
        rider_phone: newOrder.rider_phone,
        pickup_address: newOrder.pickup_address,
        pickup_latitude: newOrder.pickup_latitude,
        pickup_longitude: newOrder.pickup_longitude,
        vehicle_type: newOrder.vehicle_type,
        notes: newOrder.notes + (isTaximeter ? ' [TAXÍMETRO]' : ''),
      };
      if (!isTaximeter && newOrder.dropoff_address) {
        payload.dropoff_address = newOrder.dropoff_address;
        payload.dropoff_latitude = newOrder.dropoff_latitude;
        payload.dropoff_longitude = newOrder.dropoff_longitude;
      }
      const data = await apiService.post('/admin/trips/manual', payload);
      Alert.alert(
        isTaximeter ? 'Viaje de taxímetro creado' : 'Pedido creado',
        data?.message || 'Buscando conductor...'
      );
      setShowNewOrder(false);
      setNewOrder({
        rider_name: '', rider_phone: '', pickup_address: '', dropoff_address: '',
        vehicle_type: 'economy', notes: '', trip_type: 'full',
        pickup_latitude: -28.4696, pickup_longitude: -65.7852,
        dropoff_latitude: -28.4750, dropoff_longitude: -65.7900,
      });
      fetchRides('new');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo crear el pedido');
    } finally {
      setCreating(false);
    }
  };

  const fetchRides = useCallback(async (tab?: TabKey) => {
    try {
      const t = tab || activeTab;
      const data = await apiService.get(`/dispatch/rides?tab=${t}`);
      setRides(data?.rides || []);
      setCounts(prev => ({ ...prev, [t]: data?.count || 0 }));
    } catch (e) {
      console.error('Dispatch fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => {
    setLoading(true);
    fetchRides();
    // Auto-refresh every 5s for new/active
    const interval = setInterval(() => {
      if (activeTab === 'new' || activeTab === 'active') fetchRides();
    }, 5000);
    return () => clearInterval(interval);
  }, [activeTab]);

  // Fetch counts for all tabs
  useEffect(() => {
    const fetchCounts = async () => {
      for (const tab of ['new', 'active', 'completed', 'cancelled'] as TabKey[]) {
        try {
          const data = await apiService.get(`/dispatch/rides?tab=${tab}`);
          setCounts(prev => ({ ...prev, [tab]: data?.count || 0 }));
        } catch {}
      }
    };
    fetchCounts();
  }, []);

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '--';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '--';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  };

  const getSignalColor = (ride: DispatchRide) => {
    if (ride.status === 'accepted' || ride.status === 'arrived' || ride.status === 'started') return '#34C759';
    if (ride.current_offer_driver) return '#FFCC00';
    return '#C7C7CC';
  };

  const renderRideRow = (ride: DispatchRide, index: number) => {
    const isNew = activeTab === 'new';
    const pickup = ride.pickup_location || {};
    const dropoff = ride.dropoff_location || {};

    return (
      <View key={ride.request_id || ride.ride_id || index} style={s.rideRow}>
        <View style={s.rideCell}>
          <Text style={s.rideCellTime}>{formatDate(ride.created_at)}</Text>
          <Text style={s.rideCellTimeSub}>{formatTime(ride.created_at)}</Text>
        </View>

        {isNew && (
          <View style={s.rideCell}>
            <View style={[s.signalDot, { backgroundColor: getSignalColor(ride) }]} />
            <Text style={s.signalText}>
              {ride.current_offer_driver
                ? `#${ride.offer_index || '?'}`
                : 'Esperando'}
            </Text>
          </View>
        )}

        <View style={[s.rideCell, { flex: 2 }]}>
          <Text style={s.rideCellAddress} numberOfLines={1}>
            {pickup.address || 'Sin dirección'}
          </Text>
          <Text style={s.rideCellAddressSub} numberOfLines={1}>
            → {dropoff.address || 'Sin destino'}
          </Text>
        </View>

        {activeTab === 'active' && (
          <View style={s.rideCell}>
            <Text style={s.rideCellDriver} numberOfLines={1}>
              {ride.driver_name || 'Sin asignar'}
            </Text>
          </View>
        )}

        <View style={s.rideCell}>
          <Text style={s.rideCellFare}>
            ${Math.round(ride.estimated_fare || ride.fare || 0).toLocaleString()}
          </Text>
          <Text style={s.rideCellType}>
            {ride.vehicle_type || 'economy'}
          </Text>
        </View>

        <View style={[s.rideCell, { width: 40 }]}>
          <View style={[
            s.statusBadge,
            { backgroundColor:
              ride.status === 'accepted' ? '#34C759' :
              ride.status === 'started' ? '#007AFF' :
              ride.status === 'completed' ? '#8E8E93' :
              ride.status === 'cancelled' ? '#FF3B30' :
              '#FF9500'
            }
          ]}>
            <View style={s.statusDotInner} />
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.headerLogo}>Moli</Text>
          <Text style={s.headerSubtitle}>Despacho</Text>
        </View>
        <View style={s.headerActions}>
          <TouchableOpacity
            style={s.newOrderBtn}
            onPress={() => setShowNewOrder(true)}
          >
            <Ionicons name="add-circle" size={18} color="#fff" />
            <Text style={s.newOrderBtnText}>Nuevo pedido</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={s.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsScroll}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[s.tab, activeTab === tab.key && s.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Ionicons name={tab.icon as any} size={16} color={activeTab === tab.key ? tab.color : '#8E8E93'} />
              <Text style={[s.tabText, activeTab === tab.key && { color: tab.color, fontWeight: '700' }]}>
                {tab.label}
              </Text>
              {counts[tab.key] > 0 && (
                <View style={[s.tabBadge, { backgroundColor: tab.color }]}>
                  <Text style={s.tabBadgeText}>{counts[tab.key]}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Table Header */}
      <View style={s.tableHeader}>
        <Text style={[s.tableHeaderCell]}>Tiempo</Text>
        {activeTab === 'new' && <Text style={[s.tableHeaderCell]}>Señal</Text>}
        <Text style={[s.tableHeaderCell, { flex: 2 }]}>Dirección</Text>
        {activeTab === 'active' && <Text style={[s.tableHeaderCell]}>Conductor</Text>}
        <Text style={[s.tableHeaderCell]}>Tarifa</Text>
        <Text style={[s.tableHeaderCell, { width: 40 }]}>Est.</Text>
      </View>

      {/* Rides List */}
      <ScrollView
        style={s.ridesList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchRides(); }} />
        }
      >
        {loading ? (
          <ActivityIndicator size="large" color="#7B2D8E" style={{ marginTop: 40 }} />
        ) : rides.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="car-outline" size={48} color="#C7C7CC" />
            <Text style={s.emptyText}>No hay viajes en esta categoría</Text>
          </View>
        ) : (
          rides.map((ride, i) => renderRideRow(ride, i))
        )}
      </ScrollView>

      {/* Bottom bar with Admin button */}
      <View style={s.bottomBar}>
        <TouchableOpacity
          style={s.bottomBarBtn}
          onPress={() => router.push('/(admin)/dashboard' as any)}
        >
          <Ionicons name="settings" size={20} color="#7B2D8E" />
          <Text style={s.bottomBarBtnText}>Admin</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.bottomBarBtn}
          onPress={() => router.push('/(admin)/godseye' as any)}
        >
          <Ionicons name="map" size={20} color="#007AFF" />
          <Text style={s.bottomBarBtnText}>Mapa</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.bottomBarBtn}
          onPress={async () => { await logout(); router.replace('/'); }}
        >
          <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
          <Text style={[s.bottomBarBtnText, { color: '#FF3B30' }]}>Salir</Text>
        </TouchableOpacity>
      </View>
      {/* New Order Modal */}
      <Modal visible={showNewOrder} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={s.modalOverlay}>
            <View style={s.modalContent}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Nuevo Pedido</Text>
                <TouchableOpacity onPress={() => { setShowNewOrder(false); setPickupSuggestions([]); setDropoffSuggestions([]); }}>
                  <Ionicons name="close-circle" size={28} color="#8E8E93" />
                </TouchableOpacity>
              </View>

              <ScrollView style={s.modalBody} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* Trip type toggle */}
                <View style={s.tripTypeRow}>
                  <TouchableOpacity
                    style={[s.tripTypeBtn, newOrder.trip_type === 'full' && s.tripTypeBtnActive]}
                    onPress={() => setNewOrder(prev => ({ ...prev, trip_type: 'full' }))}
                  >
                    <Ionicons name="navigate" size={16} color={newOrder.trip_type === 'full' ? '#fff' : '#636366'} />
                    <Text style={[s.tripTypeBtnText, newOrder.trip_type === 'full' && { color: '#fff' }]}>Con destino</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.tripTypeBtn, newOrder.trip_type === 'taximeter' && s.tripTypeBtnActiveTaxi]}
                    onPress={() => setNewOrder(prev => ({ ...prev, trip_type: 'taximeter' }))}
                  >
                    <Ionicons name="speedometer" size={16} color={newOrder.trip_type === 'taximeter' ? '#fff' : '#636366'} />
                    <Text style={[s.tripTypeBtnText, newOrder.trip_type === 'taximeter' && { color: '#fff' }]}>Taxímetro</Text>
                  </TouchableOpacity>
                </View>

                <Text style={s.inputLabel}>Nombre del pasajero</Text>
                <TextInput
                  style={s.input}
                  value={newOrder.rider_name}
                  onChangeText={(t) => setNewOrder(prev => ({ ...prev, rider_name: t }))}
                  placeholder="Juan Pérez"
                  placeholderTextColor="#C7C7CC"
                />

                <Text style={s.inputLabel}>Teléfono</Text>
                <TextInput
                  style={s.input}
                  value={newOrder.rider_phone}
                  onChangeText={(t) => setNewOrder(prev => ({ ...prev, rider_phone: t }))}
                  placeholder="3834123456"
                  placeholderTextColor="#C7C7CC"
                  keyboardType="phone-pad"
                />

                {/* Pickup with autocomplete */}
                <Text style={s.inputLabel}>Dirección de recogida</Text>
                <View style={{ position: 'relative', zIndex: 20 }}>
                  <View style={s.inputWithIcon}>
                    <Ionicons name="location" size={18} color="#34C759" />
                    <TextInput
                      style={s.inputFlex}
                      value={newOrder.pickup_address}
                      onChangeText={onPickupTextChange}
                      placeholder="Buscar dirección..."
                      placeholderTextColor="#C7C7CC"
                    />
                    {searchingPickup && <ActivityIndicator size="small" color="#7B2D8E" />}
                  </View>
                  {pickupSuggestions.length > 0 && (
                    <View style={s.suggestionsBox}>
                      {pickupSuggestions.map((item, i) => (
                        <TouchableOpacity key={i} style={s.suggestionItem} onPress={() => selectSuggestion(item, 'pickup')}>
                          <Ionicons name="location-outline" size={16} color="#7B2D8E" />
                          <View style={{ flex: 1 }}>
                            <Text style={s.suggestionName} numberOfLines={1}>{item.name}</Text>
                            <Text style={s.suggestionAddr} numberOfLines={1}>{item.address}</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                {/* Dropoff with autocomplete - only for full trips */}
                {newOrder.trip_type === 'full' && (
                  <>
                    <Text style={s.inputLabel}>Dirección de destino</Text>
                    <View style={{ position: 'relative', zIndex: 10 }}>
                      <View style={s.inputWithIcon}>
                        <Ionicons name="flag" size={18} color="#FF3B30" />
                        <TextInput
                          style={s.inputFlex}
                          value={newOrder.dropoff_address}
                          onChangeText={onDropoffTextChange}
                          placeholder="Buscar destino..."
                          placeholderTextColor="#C7C7CC"
                        />
                        {searchingDropoff && <ActivityIndicator size="small" color="#7B2D8E" />}
                      </View>
                      {dropoffSuggestions.length > 0 && (
                        <View style={s.suggestionsBox}>
                          {dropoffSuggestions.map((item, i) => (
                            <TouchableOpacity key={i} style={s.suggestionItem} onPress={() => selectSuggestion(item, 'dropoff')}>
                              <Ionicons name="flag-outline" size={16} color="#FF3B30" />
                              <View style={{ flex: 1 }}>
                                <Text style={s.suggestionName} numberOfLines={1}>{item.name}</Text>
                                <Text style={s.suggestionAddr} numberOfLines={1}>{item.address}</Text>
                              </View>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  </>
                )}

                {newOrder.trip_type === 'taximeter' && (
                  <View style={s.taxiBanner}>
                    <Ionicons name="speedometer" size={20} color="#FF9500" />
                    <Text style={s.taxiBannerText}>
                      Sin destino fijo. Se activa el taxímetro al iniciar el viaje. Cobra por distancia + tiempo de espera.
                    </Text>
                  </View>
                )}

                <Text style={s.inputLabel}>Tipo de vehículo</Text>
                <View style={s.vehicleRow}>
                  {['economy', 'comfort', 'premium', 'xl'].map((vt) => (
                    <TouchableOpacity
                      key={vt}
                      style={[s.vehicleChip, newOrder.vehicle_type === vt && s.vehicleChipActive]}
                      onPress={() => setNewOrder(prev => ({ ...prev, vehicle_type: vt }))}
                    >
                      <Text style={[s.vehicleChipText, newOrder.vehicle_type === vt && s.vehicleChipTextActive]}>
                        {vt === 'economy' ? 'Eco' : vt === 'comfort' ? 'Confort' : vt === 'premium' ? 'Premium' : 'XL'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.inputLabel}>Notas (opcional)</Text>
                <TextInput
                  style={[s.input, { height: 60, textAlignVertical: 'top' }]}
                  value={newOrder.notes}
                  onChangeText={(t) => setNewOrder(prev => ({ ...prev, notes: t }))}
                  placeholder="Notas para el conductor..."
                  placeholderTextColor="#C7C7CC"
                  multiline
                />
              </ScrollView>

              <TouchableOpacity
                style={[s.createBtn, creating && { opacity: 0.6 }]}
                onPress={handleCreateOrder}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name={newOrder.trip_type === 'taximeter' ? 'speedometer' : 'send'} size={18} color="#fff" />
                    <Text style={s.createBtnText}>
                      {newOrder.trip_type === 'taximeter' ? 'Crear viaje taxímetro' : 'Crear y buscar conductor'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#1F2937', paddingHorizontal: 16, paddingVertical: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  headerLogo: { fontSize: 24, fontWeight: '900', color: '#A855F7' },
  headerSubtitle: { fontSize: 12, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  headerActions: { flexDirection: 'row', gap: 8 },
  newOrderBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#7B2D8E', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  newOrderBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  tabsContainer: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  tabsScroll: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#F2F2F7',
  },
  tabActive: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E5EA' },
  tabText: { fontSize: 13, color: '#8E8E93', fontWeight: '500' },
  tabBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6,
  },
  tabBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  tableHeader: {
    flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#E5E5EA', gap: 8,
  },
  tableHeaderCell: {
    flex: 1, fontSize: 11, fontWeight: '700', color: '#636366',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  ridesList: { flex: 1 },
  rideRow: {
    flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E5EA',
    backgroundColor: '#fff', alignItems: 'center', gap: 8,
  },
  rideCell: { flex: 1 },
  rideCellTime: { fontSize: 12, fontWeight: '600', color: '#1C1C1E' },
  rideCellTimeSub: { fontSize: 11, color: '#8E8E93' },
  signalDot: { width: 12, height: 12, borderRadius: 6, marginBottom: 2 },
  signalText: { fontSize: 10, color: '#636366', fontWeight: '600' },
  rideCellAddress: { fontSize: 12, fontWeight: '600', color: '#1C1C1E' },
  rideCellAddressSub: { fontSize: 11, color: '#8E8E93' },
  rideCellDriver: { fontSize: 12, fontWeight: '600', color: '#007AFF' },
  rideCellFare: { fontSize: 14, fontWeight: '800', color: '#1C1C1E' },
  rideCellType: { fontSize: 10, color: '#8E8E93', textTransform: 'capitalize' },
  statusBadge: {
    width: 12, height: 12, borderRadius: 6,
    justifyContent: 'center', alignItems: 'center',
  },
  statusDotInner: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff',
  },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, color: '#8E8E93', fontWeight: '500' },
  bottomBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#E5E5EA',
    paddingVertical: 8, paddingHorizontal: 16,
    justifyContent: 'space-around',
  },
  bottomBarBtn: { alignItems: 'center', gap: 2, paddingVertical: 4, paddingHorizontal: 12 },
  bottomBarBtnText: { fontSize: 11, color: '#636366', fontWeight: '600' },
  // Modal styles
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 420,
    maxHeight: '90%', overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E5E5EA',
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1C1C1E' },
  modalBody: { paddingHorizontal: 20, paddingVertical: 16 },
  inputLabel: { fontSize: 13, fontWeight: '700', color: '#636366', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#F2F2F7', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#1C1C1E', borderWidth: 1, borderColor: '#E5E5EA',
  },
  vehicleRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  vehicleChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#F2F2F7', borderWidth: 1, borderColor: '#E5E5EA',
  },
  vehicleChipActive: { backgroundColor: '#7B2D8E', borderColor: '#7B2D8E' },
  vehicleChipText: { fontSize: 13, fontWeight: '600', color: '#636366' },
  vehicleChipTextActive: { color: '#fff' },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#7B2D8E', marginHorizontal: 20, marginVertical: 16,
    paddingVertical: 14, borderRadius: 14,
  },
  createBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  // Autocomplete & trip type styles
  tripTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tripTypeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 12, backgroundColor: '#F2F2F7',
    borderWidth: 1, borderColor: '#E5E5EA',
  },
  tripTypeBtnActive: { backgroundColor: '#7B2D8E', borderColor: '#7B2D8E' },
  tripTypeBtnActiveTaxi: { backgroundColor: '#FF9500', borderColor: '#FF9500' },
  tripTypeBtnText: { fontSize: 13, fontWeight: '700', color: '#636366' },
  inputWithIcon: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F2F2F7', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#E5E5EA',
  },
  inputFlex: { flex: 1, fontSize: 15, color: '#1C1C1E' },
  suggestionsBox: {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
    backgroundColor: '#fff', borderRadius: 12, marginTop: 4,
    borderWidth: 1, borderColor: '#E5E5EA',
    maxHeight: 200,
  },
  suggestionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E5EA',
  },
  suggestionName: { fontSize: 14, fontWeight: '600', color: '#1C1C1E' },
  suggestionAddr: { fontSize: 12, color: '#8E8E93' },
  taxiBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFF8EE', borderRadius: 12, padding: 12, marginTop: 12,
    borderWidth: 1, borderColor: 'rgba(255,149,0,0.3)',
  },
  taxiBannerText: { flex: 1, fontSize: 12, color: '#996600', lineHeight: 17, fontWeight: '500' },
});
