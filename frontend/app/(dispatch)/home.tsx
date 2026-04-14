import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView,
  ActivityIndicator, Dimensions, RefreshControl, Modal, TextInput,
  Alert, KeyboardAvoidingView, Platform, FlatList, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import { apiService } from '@/src/services/api';
import DispatchMapPicker from '@/src/components/DispatchMapPicker';

const { width, height } = Dimensions.get('window');
const DARK = '#1A1D23';
const DARK2 = '#22262E';
const DARK3 = '#2A2F38';
const ACCENT = '#7B2D8E';
const ACCENT_LIGHT = '#00C853';
const GREEN = '#34C759';
const ORANGE = '#FF9500';
const RED = '#FF3B30';
const BLUE = '#007AFF';
const GRAY = '#8E8E93';
const LIGHT_TEXT = '#E5E5EA';

type TabKey = 'new' | 'active' | 'completed' | 'cancelled';

const TABS: { key: TabKey; label: string; icon: string; color: string }[] = [
  { key: 'new', label: 'Nuevos', icon: 'radio-button-on', color: ORANGE },
  { key: 'active', label: 'En curso', icon: 'car', color: GREEN },
  { key: 'completed', label: 'Terminados', icon: 'checkmark-circle', color: BLUE },
  { key: 'cancelled', label: 'Cancelados', icon: 'close-circle', color: RED },
];

interface DispatchRide {
  request_id?: string; ride_id?: string; status?: string;
  pickup_location?: any; dropoff_location?: any;
  rider_id?: string; driver_id?: string; driver_name?: string; driver_phone?: string;
  estimated_fare?: number; fare?: number; vehicle_type?: string;
  created_at?: string; current_offer_driver?: string; offer_index?: number;
  rider_name?: string; rider_phone?: string; notes?: string;
  is_manual?: boolean; is_taximeter?: boolean; is_ticketera?: boolean;
}

export default function DispatchHome() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabKey>('new');
  const [rides, setRides] = useState<DispatchRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [counts, setCounts] = useState({ new: 0, active: 0, completed: 0, cancelled: 0 });
  const [selectedRide, setSelectedRide] = useState<DispatchRide | null>(null);

  // New order state
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

  // Assign driver state
  const [showAssign, setShowAssign] = useState(false);
  const [assignPin, setAssignPin] = useState('');
  const [assignDriverId, setAssignDriverId] = useState('');
  const [drivers, setDrivers] = useState<any[]>([]);

  const searchAddress = useCallback(async (query: string, type: 'pickup' | 'dropoff') => {
    if (query.length < 3) { type === 'pickup' ? setPickupSuggestions([]) : setDropoffSuggestions([]); return; }
    type === 'pickup' ? setSearchingPickup(true) : setSearchingDropoff(true);
    try {
      const data = await apiService.get(`/places/search?q=${encodeURIComponent(query)}&lat=-28.4696&lng=-65.7852`);
      type === 'pickup' ? setPickupSuggestions(data?.results || []) : setDropoffSuggestions(data?.results || []);
    } catch {}
    type === 'pickup' ? setSearchingPickup(false) : setSearchingDropoff(false);
  }, []);

  const pickupTimerRef = React.useRef<any>(null);
  const dropoffTimerRef = React.useRef<any>(null);
  const onPickupTextChange = (t: string) => { setNewOrder(p => ({ ...p, pickup_address: t })); if (pickupTimerRef.current) clearTimeout(pickupTimerRef.current); pickupTimerRef.current = setTimeout(() => searchAddress(t, 'pickup'), 400); };
  const onDropoffTextChange = (t: string) => { setNewOrder(p => ({ ...p, dropoff_address: t })); if (dropoffTimerRef.current) clearTimeout(dropoffTimerRef.current); dropoffTimerRef.current = setTimeout(() => searchAddress(t, 'dropoff'), 400); };
  const selectSuggestion = (item: any, type: 'pickup' | 'dropoff') => {
    if (type === 'pickup') { setNewOrder(p => ({ ...p, pickup_address: item.address || item.name, pickup_latitude: item.latitude, pickup_longitude: item.longitude })); setPickupSuggestions([]); }
    else { setNewOrder(p => ({ ...p, dropoff_address: item.address || item.name, dropoff_latitude: item.latitude, dropoff_longitude: item.longitude })); setDropoffSuggestions([]); }
  };

  const handleCreateOrder = async () => {
    if (!newOrder.rider_name && !newOrder.rider_phone) { Alert.alert('Error', 'Ingresa nombre o telefono'); return; }
    if (!newOrder.pickup_address) { Alert.alert('Error', 'Ingresa direccion de recogida'); return; }
    setCreating(true);
    try {
      const isTaxi = newOrder.trip_type === 'taximeter';
      const payload: any = {
        trip_type: isTaxi ? 'destination_only' : 'full',
        rider_name: newOrder.rider_name || 'Cliente telefonico', rider_phone: newOrder.rider_phone,
        pickup_address: newOrder.pickup_address, pickup_latitude: newOrder.pickup_latitude, pickup_longitude: newOrder.pickup_longitude,
        vehicle_type: newOrder.vehicle_type, notes: newOrder.notes + (isTaxi ? ' [TAXIMETRO]' : ''),
      };
      if (!isTaxi && newOrder.dropoff_address) { payload.dropoff_address = newOrder.dropoff_address; payload.dropoff_latitude = newOrder.dropoff_latitude; payload.dropoff_longitude = newOrder.dropoff_longitude; }
      await apiService.post('/admin/trips/manual', payload);
      setShowNewOrder(false);
      setNewOrder({ rider_name: '', rider_phone: '', pickup_address: '', dropoff_address: '', vehicle_type: 'economy', notes: '', trip_type: 'full', pickup_latitude: -28.4696, pickup_longitude: -65.7852, dropoff_latitude: -28.4750, dropoff_longitude: -65.7900 });
      fetchRides('new');
    } catch (e: any) { Alert.alert('Error', e.message); }
    setCreating(false);
  };

  const fetchRides = useCallback(async (tab?: TabKey) => {
    try {
      const t = tab || activeTab;
      const data = await apiService.get(`/dispatch/rides?tab=${t}`);
      setRides(data?.rides || []);
      setCounts(prev => ({ ...prev, [t]: data?.count || 0 }));
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, [activeTab]);

  useEffect(() => { setLoading(true); fetchRides(); const iv = setInterval(() => { if (activeTab === 'new' || activeTab === 'active') fetchRides(); }, 5000); return () => clearInterval(iv); }, [activeTab]);
  useEffect(() => { const fc = async () => { for (const t of ['new', 'active', 'completed', 'cancelled'] as TabKey[]) { try { const d = await apiService.get(`/dispatch/rides?tab=${t}`); setCounts(p => ({ ...p, [t]: d?.count || 0 })); } catch {} } }; fc(); }, []);

  const fmt = (d?: string) => { if (!d) return '--'; const dt = new Date(d); return dt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }); };
  const fmtDate = (d?: string) => { if (!d) return ''; const dt = new Date(d); return dt.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }); };

  const getSignalColor = (r: DispatchRide) => {
    if (r.status === 'accepted' || r.status === 'arrived' || r.status === 'started') return GREEN;
    if (r.current_offer_driver) return '#FFCC00';
    if (r.status === 'searching') return ORANGE;
    return GRAY;
  };

  const getStatusLabel = (s?: string) => {
    const map: Record<string, string> = { pending: 'Pendiente', searching: 'Buscando', accepted: 'Aceptado', arrived: 'Llegó', started: 'En viaje', completed: 'Completado', cancelled: 'Cancelado', expired: 'Expirado' };
    return map[s || ''] || s || '--';
  };

  const handleAssignDriver = async () => {
    if (assignPin !== '0725') { Alert.alert('PIN incorrecto', 'Ingresa el PIN de supervisión correcto'); return; }
    if (!assignDriverId || !selectedRide) return;
    try {
      const reqId = selectedRide.request_id;
      if (!reqId) { Alert.alert('Error', 'No se puede asignar sin ID de solicitud'); return; }
      const result = await apiService.post(`/dispatch/assign/${reqId}`, { driver_id: assignDriverId, pin: assignPin });
      Alert.alert('Conductor asignado', result?.driver ? `Asignado a ${result.driver}` : 'Asignado correctamente');
      setShowAssign(false); setAssignPin(''); setAssignDriverId(''); setSelectedRide(null);
      fetchRides();
    } catch (e: any) { Alert.alert('Error', e.message || 'No se pudo asignar'); }
  };

  const handleCancelRide = async () => {
    if (!selectedRide) return;
    const reqId = selectedRide.request_id;
    if (!reqId) return;
    Alert.alert('Cancelar viaje', '¿Estás seguro de cancelar este viaje?', [
      { text: 'No', style: 'cancel' },
      { text: 'Sí, cancelar', style: 'destructive', onPress: async () => {
        try {
          await apiService.post(`/dispatch/cancel/${reqId}?reason=Cancelado+por+despacho`, {});
          setSelectedRide(null);
          fetchRides();
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  const rideKey = (r: DispatchRide) => r.request_id || r.ride_id || '';

  const renderRideRow = (ride: DispatchRide, index: number) => {
    const pickup = ride.pickup_location || {};
    const key = rideKey(ride);
    const selKey = selectedRide ? rideKey(selectedRide) : '';
    const isSelected = key === selKey && key !== '';
    return (
      <Pressable
        key={key || index}
        style={({ pressed }) => [s.rideRow, isSelected && s.rideRowSelected, pressed && { opacity: 0.7 }]}
        onPress={() => { setSelectedRide(isSelected ? null : { ...ride }); }}
      >
        <View style={s.rideColTime}>
          <Text style={s.rideTime}>{fmt(ride.created_at)}</Text>
          <Text style={s.rideDate}>{fmtDate(ride.created_at)}</Text>
        </View>

        {activeTab === 'new' && (
          <View style={s.rideColSignal}>
            <View style={[s.signalDot, { backgroundColor: getSignalColor(ride) }]} />
            <Text style={[s.signalLabel, { color: getSignalColor(ride) }]}>
              {ride.current_offer_driver ? `#${ride.offer_index || '?'}` : ride.status === 'searching' ? 'Buscando' : 'Espera'}
            </Text>
          </View>
        )}

        <View style={s.rideColAddr}>
          <Text style={s.rideAddr} numberOfLines={1}>{pickup.address || 'Sin dirección'}</Text>
          {ride.dropoff_location?.address ? (
            <Text style={s.rideAddrSub} numberOfLines={1}>{ride.dropoff_location.address}</Text>
          ) : (
            <Text style={[s.rideAddrSub, { color: ORANGE }]}>Taxímetro</Text>
          )}
        </View>

        {activeTab === 'active' && ride.driver_name && (
          <View style={s.rideColDriver}>
            <Text style={s.rideDriverName} numberOfLines={1}>{ride.driver_name}</Text>
          </View>
        )}

        <View style={s.rideColFare}>
          <Text style={s.rideFare}>${Math.round(ride.estimated_fare || ride.fare || 0)}</Text>
          <Text style={s.rideType}>{ride.vehicle_type || 'eco'}</Text>
        </View>
      </Pressable>
    );
  };

  // Detail panel (now as modal content)
  const renderDetailPanel = () => {
    if (!selectedRide) return null;
    const r = selectedRide;
    const pickup = r.pickup_location || {};
    const dropoff = r.dropoff_location || {};
    return (
      <>
        <View style={s.detailHeader}>
          <Text style={s.detailTitle}>Detalle del viaje</Text>
          <TouchableOpacity onPress={() => setSelectedRide(null)}>
            <Ionicons name="close" size={24} color={GRAY} />
          </TouchableOpacity>
        </View>
        <ScrollView style={s.detailBody} showsVerticalScrollIndicator={false}>
          {/* Status */}
          <View style={s.detailStatusRow}>
            <View style={[s.detailStatusBadge, { backgroundColor: getSignalColor(r) }]}>
              <Text style={s.detailStatusText}>{getStatusLabel(r.status)}</Text>
            </View>
            {(r.is_taximeter || r.is_ticketera) && (
              <View style={[s.detailStatusBadge, { backgroundColor: ORANGE }]}>
                <Text style={s.detailStatusText}>Taxímetro</Text>
              </View>
            )}
            {r.is_manual && (
              <View style={[s.detailStatusBadge, { backgroundColor: ACCENT }]}>
                <Text style={s.detailStatusText}>Manual</Text>
              </View>
            )}
          </View>

          {/* Rider info */}
          <View style={s.detailSection}>
            <Text style={s.detailLabel}>Pasajero</Text>
            <Text style={s.detailValue}>{r.rider_name || 'Sin nombre'}</Text>
            {r.rider_phone && <Text style={s.detailValueSub}>{r.rider_phone}</Text>}
          </View>

          {/* Addresses */}
          <View style={s.detailSection}>
            <View style={s.addrRow}>
              <View style={[s.addrDot, { backgroundColor: GREEN }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.detailLabel}>Recogida</Text>
                <Text style={s.detailValue}>{pickup.address || 'Sin dirección'}</Text>
              </View>
            </View>
            {dropoff?.address && (
              <View style={[s.addrRow, { marginTop: 10 }]}>
                <View style={[s.addrDot, { backgroundColor: RED }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.detailLabel}>Destino</Text>
                  <Text style={s.detailValue}>{dropoff.address}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Fare */}
          <View style={s.detailSection}>
            <Text style={s.detailLabel}>Tarifa estimada</Text>
            <Text style={[s.detailValue, { fontSize: 22, color: GREEN }]}>
              ${Math.round(r.estimated_fare || r.fare || 0)}
            </Text>
          </View>

          {/* Driver */}
          {r.driver_name && (
            <View style={s.detailSection}>
              <Text style={s.detailLabel}>Conductor asignado</Text>
              <Text style={s.detailValue}>{r.driver_name}</Text>
              {r.driver_phone && <Text style={s.detailValueSub}>{r.driver_phone}</Text>}
            </View>
          )}

          {/* Signal info */}
          {activeTab === 'new' && (
            <View style={s.detailSection}>
              <Text style={s.detailLabel}>Señal de llamada</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[s.signalDot, { backgroundColor: getSignalColor(r) }]} />
                <Text style={s.detailValue}>
                  {r.current_offer_driver ? `Ofreciendo a conductor #${r.offer_index}` : 'Esperando conductor disponible'}
                </Text>
              </View>
            </View>
          )}

          {r.notes && (
            <View style={s.detailSection}>
              <Text style={s.detailLabel}>Notas</Text>
              <Text style={s.detailValueSub}>{r.notes}</Text>
            </View>
          )}

          {/* Actions */}
          <View style={s.detailActions}>
            {(r.status === 'searching' || r.status === 'pending') && (
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: ACCENT }]} onPress={() => { setShowAssign(true); loadDrivers(); }}>
                <Ionicons name="person-add" size={16} color="#fff" />
                <Text style={s.actionBtnText}>Asignar conductor</Text>
              </TouchableOpacity>
            )}
            {r.status !== 'completed' && r.status !== 'cancelled' && (
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: RED }]} onPress={handleCancelRide}>
                <Ionicons name="close" size={16} color="#fff" />
                <Text style={s.actionBtnText}>Cancelar viaje</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </>
    );
  };

  const loadDrivers = async () => {
    try {
      const data = await apiService.get('/admin/users?user_type=driver&limit=50');
      setDrivers(data?.users || []);
    } catch {}
  };

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.logo}>Moli</Text>
          <View style={s.headerDivider} />
          <Text style={s.headerLabel}>DESPACHO</Text>
        </View>
        <TouchableOpacity style={s.newOrderBtn} onPress={() => setShowNewOrder(true)}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.newOrderText}>Nuevo pedido</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={s.tabsBar}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[s.tab, activeTab === tab.key && s.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons name={tab.icon as any} size={14} color={activeTab === tab.key ? tab.color : GRAY} />
            <Text style={[s.tabLabel, activeTab === tab.key && { color: '#fff' }]}>{tab.label}</Text>
            {counts[tab.key] > 0 && (
              <View style={[s.badge, { backgroundColor: activeTab === tab.key ? tab.color : DARK3 }]}>
                <Text style={s.badgeText}>{counts[tab.key]}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Main content */}
      <View style={s.mainRow}>
        <View style={s.listPanel}>
          {/* Column headers */}
          <View style={s.colHeader}>
            <Text style={[s.colHeaderText, { width: 55 }]}>Hora</Text>
            {activeTab === 'new' && <Text style={[s.colHeaderText, { width: 65 }]}>Señal</Text>}
            <Text style={[s.colHeaderText, { flex: 1 }]}>Dirección</Text>
            {activeTab === 'active' && <Text style={[s.colHeaderText, { width: 80 }]}>Conductor</Text>}
            <Text style={[s.colHeaderText, { width: 60 }]}>Tarifa</Text>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchRides(); }} tintColor={ACCENT_LIGHT} />}
          >
            {loading ? (
              <ActivityIndicator size="large" color={ACCENT_LIGHT} style={{ marginTop: 40 }} />
            ) : rides.length === 0 ? (
              <View style={s.emptyState}>
                <Ionicons name="car-outline" size={40} color={DARK3} />
                <Text style={s.emptyText}>Sin viajes</Text>
              </View>
            ) : (
              rides.map((r, i) => renderRideRow(r, i))
            )}
          </ScrollView>
        </View>
      </View>

      {/* Ride detail modal */}
      <Modal visible={!!selectedRide} transparent animationType="fade">
        <View style={s.modalOverlay}>
          {selectedRide && (
            <View style={[s.modalContent, { maxWidth: 480, maxHeight: '85%' }]}>
              {renderDetailPanel()}
            </View>
          )}
        </View>
      </Modal>

      {/* Bottom nav */}
      <View style={s.bottomNav}>
        <TouchableOpacity style={s.navBtn} onPress={() => router.push('/(admin)/dashboard' as any)}>
          <Ionicons name="settings-outline" size={20} color={ACCENT_LIGHT} />
          <Text style={s.navLabel}>Admin</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.navBtn} onPress={() => router.push('/(admin)/dispatchers' as any)}>
          <Ionicons name="headset-outline" size={20} color={ORANGE} />
          <Text style={s.navLabel}>Operadores</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.navBtn} onPress={() => router.push('/(admin)/godseye' as any)}>
          <Ionicons name="globe-outline" size={20} color={BLUE} />
          <Text style={s.navLabel}>Mapa vivo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.navBtn} onPress={async () => { await logout(); router.replace('/'); }}>
          <Ionicons name="log-out-outline" size={20} color={RED} />
          <Text style={[s.navLabel, { color: RED }]}>Salir</Text>
        </TouchableOpacity>
      </View>

      {/* Assign driver modal */}
      <Modal visible={showAssign} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { maxWidth: 340 }]}>
            <Text style={s.modalTitle}>Asignar conductor</Text>
            <Text style={s.inputLabel}>PIN de supervisión</Text>
            <TextInput style={s.input} value={assignPin} onChangeText={setAssignPin} placeholder="0725" placeholderTextColor="#666" secureTextEntry keyboardType="number-pad" />
            <Text style={s.inputLabel}>Seleccionar conductor</Text>
            <ScrollView style={{ maxHeight: 200 }}>
              {drivers.filter(d => d.user_type === 'driver').map((d) => (
                <TouchableOpacity key={d.user_id} style={[s.driverOption, assignDriverId === d.user_id && s.driverOptionActive]} onPress={() => setAssignDriverId(d.user_id)}>
                  <Text style={[s.driverOptionText, assignDriverId === d.user_id && { color: '#fff' }]}>{d.name || d.email}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity style={[s.actionBtn, { flex: 1, backgroundColor: DARK3 }]} onPress={() => setShowAssign(false)}>
                <Text style={s.actionBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.actionBtn, { flex: 1, backgroundColor: ACCENT }]} onPress={handleAssignDriver}>
                <Text style={s.actionBtnText}>Asignar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* New Order Modal */}
      <Modal visible={showNewOrder} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={s.modalOverlay}>
            <View style={s.modalContent}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={s.modalTitle}>Nuevo Pedido</Text>
                <TouchableOpacity onPress={() => { setShowNewOrder(false); setPickupSuggestions([]); setDropoffSuggestions([]); }}>
                  <Ionicons name="close-circle" size={26} color={GRAY} />
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={s.tripTypeRow}>
                  <TouchableOpacity style={[s.tripTypeBtn, newOrder.trip_type === 'full' && { backgroundColor: ACCENT, borderColor: ACCENT }]} onPress={() => setNewOrder(p => ({ ...p, trip_type: 'full' }))}>
                    <Ionicons name="navigate" size={15} color={newOrder.trip_type === 'full' ? '#fff' : GRAY} />
                    <Text style={[s.tripTypeTxt, newOrder.trip_type === 'full' && { color: '#fff' }]}>Con destino</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.tripTypeBtn, newOrder.trip_type === 'taximeter' && { backgroundColor: ORANGE, borderColor: ORANGE }]} onPress={() => setNewOrder(p => ({ ...p, trip_type: 'taximeter' }))}>
                    <Ionicons name="speedometer" size={15} color={newOrder.trip_type === 'taximeter' ? '#fff' : GRAY} />
                    <Text style={[s.tripTypeTxt, newOrder.trip_type === 'taximeter' && { color: '#fff' }]}>Taxímetro</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}><Text style={s.inputLabel}>Nombre</Text><TextInput style={s.input} value={newOrder.rider_name} onChangeText={t => setNewOrder(p => ({ ...p, rider_name: t }))} placeholder="Nombre" placeholderTextColor="#555" /></View>
                  <View style={{ flex: 1 }}><Text style={s.inputLabel}>Teléfono</Text><TextInput style={s.input} value={newOrder.rider_phone} onChangeText={t => setNewOrder(p => ({ ...p, rider_phone: t }))} placeholder="3834..." placeholderTextColor="#555" keyboardType="phone-pad" /></View>
                </View>
                <Text style={s.inputLabel}>Recogida</Text>
                <View style={{ zIndex: 20 }}>
                  <View style={s.inputRow}><Ionicons name="location" size={16} color={GREEN} /><TextInput style={s.inputFlex} value={newOrder.pickup_address} onChangeText={onPickupTextChange} placeholder="Buscar dirección..." placeholderTextColor="#555" />{searchingPickup && <ActivityIndicator size="small" color={ACCENT_LIGHT} />}</View>
                  {pickupSuggestions.length > 0 && (<View style={s.sugBox}>{pickupSuggestions.map((it, i) => (<TouchableOpacity key={i} style={s.sugItem} onPress={() => selectSuggestion(it, 'pickup')}><Ionicons name="location-outline" size={14} color={ACCENT_LIGHT} /><View style={{ flex: 1 }}><Text style={s.sugName} numberOfLines={1}>{it.name}</Text><Text style={s.sugAddr} numberOfLines={1}>{it.address}</Text></View></TouchableOpacity>))}</View>)}
                </View>
                {newOrder.trip_type === 'full' && (<><Text style={s.inputLabel}>Destino</Text><View style={{ zIndex: 10 }}><View style={s.inputRow}><Ionicons name="flag" size={16} color={RED} /><TextInput style={s.inputFlex} value={newOrder.dropoff_address} onChangeText={onDropoffTextChange} placeholder="Buscar destino..." placeholderTextColor="#555" />{searchingDropoff && <ActivityIndicator size="small" color={ACCENT_LIGHT} />}</View>{dropoffSuggestions.length > 0 && (<View style={s.sugBox}>{dropoffSuggestions.map((it, i) => (<TouchableOpacity key={i} style={s.sugItem} onPress={() => selectSuggestion(it, 'dropoff')}><Ionicons name="flag-outline" size={14} color={RED} /><View style={{ flex: 1 }}><Text style={s.sugName} numberOfLines={1}>{it.name}</Text><Text style={s.sugAddr} numberOfLines={1}>{it.address}</Text></View></TouchableOpacity>))}</View>)}</View></>)}
                {newOrder.trip_type === 'taximeter' && (<View style={s.taxiBanner}><Ionicons name="speedometer" size={18} color={ORANGE} /><Text style={s.taxiBannerTxt}>Sin destino. Taxímetro se activa al iniciar viaje.</Text></View>)}
                {/* OSM Map with draggable pin */}
                <Text style={s.inputLabel}>Ubicación en mapa (arrastrá el pin)</Text>
                <DispatchMapPicker
                  latitude={newOrder.pickup_latitude}
                  longitude={newOrder.pickup_longitude}
                  height={160}
                  onLocationChange={async (lat, lng) => {
                    setNewOrder(p => ({ ...p, pickup_latitude: lat, pickup_longitude: lng }));
                    // Reverse geocode to update address
                    try {
                      const data = await apiService.get(`/places/reverse?lat=${lat}&lng=${lng}`);
                      if (data?.address) {
                        setNewOrder(p => ({ ...p, pickup_address: data.address, pickup_latitude: lat, pickup_longitude: lng }));
                      }
                    } catch {}
                  }}
                />
                <Text style={s.inputLabel}>Vehículo</Text>
                <View style={s.vRow}>{['economy', 'comfort', 'premium', 'xl'].map(v => (<TouchableOpacity key={v} style={[s.vChip, newOrder.vehicle_type === v && s.vChipActive]} onPress={() => setNewOrder(p => ({ ...p, vehicle_type: v }))}><Text style={[s.vChipTxt, newOrder.vehicle_type === v && { color: '#fff' }]}>{v === 'economy' ? 'Eco' : v === 'comfort' ? 'Confort' : v === 'premium' ? 'Premium' : 'XL'}</Text></TouchableOpacity>))}</View>
                <Text style={s.inputLabel}>Notas</Text>
                <TextInput style={[s.input, { height: 50 }]} value={newOrder.notes} onChangeText={t => setNewOrder(p => ({ ...p, notes: t }))} placeholder="Notas..." placeholderTextColor="#555" multiline />
              </ScrollView>
              <TouchableOpacity style={[s.createBtn, creating && { opacity: 0.5 }]} onPress={handleCreateOrder} disabled={creating}>
                {creating ? <ActivityIndicator color="#fff" /> : <><Ionicons name={newOrder.trip_type === 'taximeter' ? 'speedometer' : 'send'} size={16} color="#fff" /><Text style={s.createBtnTxt}>{newOrder.trip_type === 'taximeter' ? 'Crear taxímetro' : 'Crear pedido'}</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: DARK },
  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: DARK2, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: DARK3 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { fontSize: 22, fontWeight: '900', color: ACCENT_LIGHT },
  headerDivider: { width: 1, height: 20, backgroundColor: DARK3 },
  headerLabel: { fontSize: 11, fontWeight: '800', color: GRAY, letterSpacing: 2 },
  newOrderBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: ACCENT, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  newOrderText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  // Tabs
  tabsBar: { flexDirection: 'row', backgroundColor: DARK2, paddingHorizontal: 8, paddingVertical: 6, gap: 4, borderBottomWidth: 1, borderBottomColor: DARK3 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6 },
  tabActive: { backgroundColor: DARK3 },
  tabLabel: { fontSize: 12, fontWeight: '600', color: GRAY },
  badge: { minWidth: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  // Main
  mainRow: { flex: 1, flexDirection: 'row' },
  listPanel: { flex: 2, borderRightWidth: 1, borderRightColor: DARK3 },
  colHeader: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 6, backgroundColor: DARK2, borderBottomWidth: 1, borderBottomColor: DARK3, gap: 6 },
  colHeaderText: { fontSize: 10, fontWeight: '700', color: GRAY, textTransform: 'uppercase', letterSpacing: 0.5 },
  rideRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: DARK3, gap: 6 },
  rideRowSelected: { backgroundColor: DARK3 },
  rideColTime: { width: 55 },
  rideTime: { fontSize: 13, fontWeight: '700', color: LIGHT_TEXT },
  rideDate: { fontSize: 10, color: GRAY },
  rideColSignal: { width: 65, alignItems: 'center' },
  signalDot: { width: 14, height: 14, borderRadius: 7, marginBottom: 2 },
  signalLabel: { fontSize: 10, fontWeight: '700' },
  rideColAddr: { flex: 1 },
  rideAddr: { fontSize: 12, fontWeight: '600', color: LIGHT_TEXT },
  rideAddrSub: { fontSize: 11, color: GRAY, marginTop: 1 },
  rideColDriver: { width: 80 },
  rideDriverName: { fontSize: 12, fontWeight: '600', color: BLUE },
  rideColFare: { width: 60, alignItems: 'flex-end' },
  rideFare: { fontSize: 14, fontWeight: '800', color: LIGHT_TEXT },
  rideType: { fontSize: 9, color: GRAY, textTransform: 'uppercase' },
  emptyState: { alignItems: 'center', paddingTop: 50, gap: 8 },
  emptyText: { fontSize: 14, color: GRAY },
  // Detail panel
  detailPanel: { flex: 1, backgroundColor: DARK2, minWidth: 260 },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: DARK3 },
  detailTitle: { fontSize: 15, fontWeight: '800', color: LIGHT_TEXT },
  detailBody: { flex: 1, padding: 14 },
  detailStatusRow: { flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
  detailStatusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  detailStatusText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  detailSection: { marginBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: DARK3, paddingBottom: 12 },
  detailLabel: { fontSize: 10, fontWeight: '700', color: GRAY, textTransform: 'uppercase', marginBottom: 3 },
  detailValue: { fontSize: 14, fontWeight: '600', color: LIGHT_TEXT },
  detailValueSub: { fontSize: 12, color: GRAY, marginTop: 2 },
  addrRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  addrDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  detailActions: { gap: 8, marginTop: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8 },
  actionBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  // Bottom nav
  bottomNav: { flexDirection: 'row', backgroundColor: DARK2, borderTopWidth: 1, borderTopColor: DARK3, paddingVertical: 6, justifyContent: 'space-around' },
  navBtn: { alignItems: 'center', gap: 2, paddingVertical: 2 },
  navLabel: { fontSize: 10, color: GRAY, fontWeight: '600' },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContent: { backgroundColor: DARK2, borderRadius: 16, width: '100%', maxWidth: 420, maxHeight: '90%', padding: 20, borderWidth: 1, borderColor: DARK3 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: LIGHT_TEXT },
  inputLabel: { fontSize: 11, fontWeight: '700', color: GRAY, marginBottom: 4, marginTop: 10, textTransform: 'uppercase' },
  input: { backgroundColor: DARK3, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: LIGHT_TEXT, borderWidth: 1, borderColor: '#333' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: DARK3, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#333' },
  inputFlex: { flex: 1, fontSize: 14, color: LIGHT_TEXT },
  sugBox: { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, backgroundColor: DARK2, borderRadius: 8, marginTop: 2, borderWidth: 1, borderColor: DARK3, maxHeight: 180 },
  sugItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: DARK3 },
  sugName: { fontSize: 13, fontWeight: '600', color: LIGHT_TEXT },
  sugAddr: { fontSize: 11, color: GRAY },
  tripTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  tripTypeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 8, backgroundColor: DARK3, borderWidth: 1, borderColor: '#333' },
  tripTypeTxt: { fontSize: 12, fontWeight: '700', color: GRAY },
  taxiBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,149,0,0.1)', borderRadius: 8, padding: 10, marginTop: 8, borderWidth: 1, borderColor: 'rgba(255,149,0,0.3)' },
  taxiBannerTxt: { flex: 1, fontSize: 11, color: ORANGE, fontWeight: '500' },
  vRow: { flexDirection: 'row', gap: 6 },
  vChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6, backgroundColor: DARK3, borderWidth: 1, borderColor: '#333' },
  vChipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  vChipTxt: { fontSize: 12, fontWeight: '600', color: GRAY },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: ACCENT, paddingVertical: 12, borderRadius: 8, marginTop: 14 },
  createBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  // Driver assign
  driverOption: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 6, marginBottom: 4, backgroundColor: DARK3 },
  driverOptionActive: { backgroundColor: ACCENT },
  driverOptionText: { fontSize: 13, fontWeight: '600', color: LIGHT_TEXT },
});
