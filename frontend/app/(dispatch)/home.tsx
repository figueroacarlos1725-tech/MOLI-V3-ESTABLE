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
            onPress={() => router.push('/(admin)/trips' as any)}
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
});
