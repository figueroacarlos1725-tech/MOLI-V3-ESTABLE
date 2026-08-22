import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  AppState,
  Linking,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import { apiService } from '@/src/services/api';

interface DashboardStats {
  total_users: number;
  total_drivers: number;
  online_drivers: number;
  today_rides: number;
  active_rides: number;
  today_revenue: number;
  today_commission: number;
}

// Persist stats globally so they survive unmount/remount
let _cachedStats: DashboardStats | null = null;

export default function AdminDashboardScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(_cachedStats);
  const [loadingStats, setLoadingStats] = useState(!_cachedStats);
  const [refreshing, setRefreshing] = useState(false);
  const isMounted = useRef(true);

  const fetchStats = useCallback(async (isRefresh = false) => {
    if (!isRefresh && !_cachedStats) setLoadingStats(true);
    try {
      const response = await apiService.get('/admin/dashboard');
      if (isMounted.current && response?.stats) {
        const s = response.stats;
        setStats(s);
        _cachedStats = s; // persist across remounts
      }
    } catch (error) {
      console.error('Error obteniendo estadisticas:', error);
      // Don't reset stats on error - keep showing old data
    } finally {
      if (isMounted.current) {
        setLoadingStats(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Re-fetch stats every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchStats();
    }, [fetchStats])
  );

  // Also refresh when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isMounted.current) fetchStats();
    });
    return () => sub.remove();
  }, [fetchStats]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchStats(true);
  };

  const statCards = [
    { title: 'Usuarios totales', value: stats?.total_users ?? 0, icon: 'people', color: '#007AFF', bgColor: '#E3F2FD' },
    { title: 'Conductores', value: stats?.total_drivers ?? 0, icon: 'car-sport', color: '#FF7733', bgColor: '#FFF0EC' },
    { title: 'En linea', value: stats?.online_drivers ?? 0, icon: 'radio-button-on', color: '#FF9500', bgColor: '#FFF3E0' },
    { title: 'Viajes activos', value: stats?.active_rides ?? 0, icon: 'navigate', color: '#FF7733', bgColor: '#FFF0EC' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF7733" />}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Panel de Admin</Text>
            <Text style={styles.subGreeting}>Bienvenido, {user?.name}</Text>
          </View>
          <TouchableOpacity style={styles.notificationButton}>
            <Ionicons name="notifications-outline" size={24} color="#1C1C1E" />
          </TouchableOpacity>
        </View>

        {loadingStats && !stats ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#FF7733" />
            <Text style={styles.loadingText}>Cargando estadísticas...</Text>
          </View>
        ) : (
          <View style={styles.revenueCard}>
            <View style={styles.revenueHeader}>
              <Text style={styles.revenueLabel}>Ingresos de hoy</Text>
              <Text style={styles.revenueDate}>
                {new Date().toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}
              </Text>
            </View>
            <Text style={styles.revenueAmount}>
              ${(stats?.today_revenue ?? 0).toFixed(2)}
            </Text>
            <View style={styles.revenueStats}>
              <View style={styles.revenueStat}>
                <Text style={styles.revenueStatLabel}>Comisión</Text>
                <Text style={styles.revenueStatValue}>${(stats?.today_commission ?? 0).toFixed(2)}</Text>
              </View>
              <View style={styles.revenueStat}>
                <Text style={styles.revenueStatLabel}>Viajes</Text>
                <Text style={styles.revenueStatValue}>{stats?.today_rides ?? 0}</Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.statsGrid}>
          {statCards.map((stat, index) => (
            <View key={index} style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: stat.bgColor }]}>
                <Ionicons name={stat.icon as any} size={24} color={stat.color} />
              </View>
              {loadingStats && !stats ? (
                <ActivityIndicator size="small" color="#FF7733" style={{ marginVertical: 4 }} />
              ) : (
                <Text style={styles.statValue}>{stat.value}</Text>
              )}
              <Text style={styles.statTitle}>{stat.title}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Acciones rápidas</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/(admin)/users' as any)}>
              <Ionicons name="person-add" size={24} color="#007AFF" />
              <Text style={styles.actionText}>Agregar usuario</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/(admin)/verification' as any)}>
              <Ionicons name="car" size={24} color="#FF7733" />
              <Text style={styles.actionText}>Verificar conductor</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/(admin)/coupons' as any)}>
              <Ionicons name="ticket" size={24} color="#FF9500" />
              <Text style={styles.actionText}>Agregar cupón</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/(admin)/places' as any)}>
              <Ionicons name="location" size={24} color="#34C759" />
              <Text style={styles.actionText}>Lugares y Cache</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/(admin)/trips' as any)}>
              <Ionicons name="bar-chart" size={24} color="#FF7733" />
              <Text style={styles.actionText}>Reportes</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Admin Web Access */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Acceso Web</Text>
          <TouchableOpacity 
            style={{ backgroundColor: '#1C1C1E', borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 }}
            onPress={() => Linking.openURL(`${process.env.EXPO_PUBLIC_BACKEND_URL || 'https://taxify-clone.emergent.host'}`)}
          >
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#FF7733', justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="globe" size={24} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Abrir Panel Admin Web</Text>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 }}>Administrar desde el navegador</Text>
            </View>
            <Ionicons name="open-outline" size={20} color="#FF7733" />
          </TouchableOpacity>
          
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#1C1C1E' }}>Conectar dominio personalizado</Text>
            <Text style={{ fontSize: 12, color: '#8E8E93', lineHeight: 18 }}>
              Tu app esta disponible en:{'\n'}
              taxify-clone.emergent.host{'\n\n'}
              Para usar tu propio dominio (ej: app.moli.com.ar):{'\n'}
              1. Configurar un CNAME en tu DNS apuntando a taxify-clone.emergent.host{'\n'}
              2. Contactar a soporte de Emergent para activar el SSL
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff' },
  greeting: { fontSize: 28, fontWeight: 'bold', color: '#1C1C1E' },
  subGreeting: { fontSize: 14, color: '#8E8E93', marginTop: 4 },
  notificationButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' },
  loadingCard: { margin: 16, borderRadius: 20, padding: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF7733' },
  loadingText: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginTop: 12 },
  revenueCard: { backgroundColor: '#FF7733', margin: 16, borderRadius: 20, padding: 24 },
  revenueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  revenueLabel: { fontSize: 14, color: 'rgba(255,255,255,0.85)' },
  revenueDate: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  revenueAmount: { fontSize: 42, fontWeight: 'bold', color: '#fff', marginTop: 8 },
  revenueStats: { flexDirection: 'row', marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.25)' },
  revenueStat: { flex: 1 },
  revenueStatLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  revenueStatValue: { fontSize: 18, fontWeight: '600', color: '#fff', marginTop: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 8 },
  statCard: { width: '50%', padding: 8 },
  statIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  statValue: { fontSize: 24, fontWeight: 'bold', color: '#1C1C1E' },
  statTitle: { fontSize: 13, color: '#8E8E93', marginTop: 4 },
  section: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#1C1C1E', marginBottom: 16 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionCard: { width: '48%', backgroundColor: '#fff', borderRadius: 16, padding: 20, alignItems: 'center' },
  actionText: { fontSize: 14, fontWeight: '600', color: '#1C1C1E', marginTop: 12 },
});
