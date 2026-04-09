import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
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

export default function AdminDashboardScreen() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await apiService.get('/admin/dashboard');
      setStats(response.stats);
    } catch (error) {
      console.error('Error obteniendo estadisticas:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
  };

  const statCards = [
    { title: 'Usuarios totales', value: stats?.total_users || 0, icon: 'people', color: '#007AFF', bgColor: '#E3F2FD' },
    { title: 'Conductores', value: stats?.total_drivers || 0, icon: 'car-sport', color: '#6BBF00', bgColor: '#E8F5E9' },
    { title: 'En linea', value: stats?.online_drivers || 0, icon: 'radio-button-on', color: '#FF9500', bgColor: '#FFF3E0' },
    { title: 'Viajes activos', value: stats?.active_rides || 0, icon: 'navigate', color: '#8E44AD', bgColor: '#F3E5F5' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Panel de Admin</Text>
            <Text style={styles.subGreeting}>Bienvenido, {user?.name}</Text>
          </View>
          <TouchableOpacity style={styles.notificationButton}>
            <Ionicons name="notifications-outline" size={24} color="#1C1C1E" />
          </TouchableOpacity>
        </View>

        <View style={styles.revenueCard}>
          <View style={styles.revenueHeader}>
            <Text style={styles.revenueLabel}>Ingresos de hoy</Text>
            <Text style={styles.revenueDate}>
              {new Date().toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}
            </Text>
          </View>
          <Text style={styles.revenueAmount}>
            ${stats?.today_revenue?.toFixed(2) || '0.00'}
          </Text>
          <View style={styles.revenueStats}>
            <View style={styles.revenueStat}>
              <Text style={styles.revenueStatLabel}>Comision</Text>
              <Text style={styles.revenueStatValue}>${stats?.today_commission?.toFixed(2) || '0.00'}</Text>
            </View>
            <View style={styles.revenueStat}>
              <Text style={styles.revenueStatLabel}>Viajes</Text>
              <Text style={styles.revenueStatValue}>{stats?.today_rides || 0}</Text>
            </View>
          </View>
        </View>

        <View style={styles.statsGrid}>
          {statCards.map((stat, index) => (
            <View key={index} style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: stat.bgColor }]}>
                <Ionicons name={stat.icon as any} size={24} color={stat.color} />
              </View>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statTitle}>{stat.title}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Acciones rapidas</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity style={styles.actionCard}>
              <Ionicons name="person-add" size={24} color="#007AFF" />
              <Text style={styles.actionText}>Agregar usuario</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard}>
              <Ionicons name="car" size={24} color="#6BBF00" />
              <Text style={styles.actionText}>Verificar conductor</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard}>
              <Ionicons name="ticket" size={24} color="#FF9500" />
              <Text style={styles.actionText}>Agregar cupon</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard}>
              <Ionicons name="bar-chart" size={24} color="#8E44AD" />
              <Text style={styles.actionText}>Reportes</Text>
            </TouchableOpacity>
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
  revenueCard: { backgroundColor: '#8E44AD', margin: 16, borderRadius: 20, padding: 24 },
  revenueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  revenueLabel: { fontSize: 14, color: 'rgba(255,255,255,0.8)' },
  revenueDate: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  revenueAmount: { fontSize: 42, fontWeight: 'bold', color: '#fff', marginTop: 8 },
  revenueStats: { flexDirection: 'row', marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)' },
  revenueStat: { flex: 1 },
  revenueStatLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
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
