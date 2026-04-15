import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiService } from '@/src/services/api';
import { useAuthStore } from '@/src/stores/authStore';

const GREEN = '#00C853';

export default function ClientProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuthStore();
  const [wallet, setWallet] = useState<any>(null);
  const [myJobs, setMyJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [walletRes, jobsRes] = await Promise.all([
        apiService.get('/wallet/status').catch(() => ({ balance: 0 })),
        apiService.get('/jobs/my-posts').catch(() => ({ jobs: [] })),
      ]);
      setWallet(walletRes);
      setMyJobs(jobsRes.jobs || []);
    } catch {}
    setLoading(false);
  };

  const doLogout = async () => {
    try { await logout(); } catch {}
    if (typeof window !== 'undefined') window.location.href = '/';
    else router.replace('/');
  };

  const completed = myJobs.filter(j => j.status === 'completed').length;
  const active = myJobs.filter(j => ['open', 'assigned', 'reviewing', 'in_progress'].includes(j.status)).length;
  const activeJobs = myJobs.filter(j => ['open', 'assigned', 'reviewing', 'in_progress'].includes(j.status));
  const pastJobs = myJobs.filter(j => !['open', 'assigned', 'reviewing', 'in_progress'].includes(j.status));

  if (loading) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.center}><ActivityIndicator size="large" color={GREEN} /></View>
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Mi Perfil</Text>
        </View>

        {/* Profile Card */}
        <View style={s.profileCard}>
          <View style={s.avatar}>
            <Ionicons name="person" size={40} color={GREEN} />
          </View>
          <Text style={s.userName}>{user?.name || 'Cliente'}</Text>
          <Text style={s.userEmail}>{user?.email}</Text>
          <View style={s.statsRow}>
            <View style={s.statItem}>
              <Text style={s.statValue}>{myJobs.length}</Text>
              <Text style={s.statLabel}>Publicados</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statValue}>{completed}</Text>
              <Text style={s.statLabel}>Completados</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statValue}>{active}</Text>
              <Text style={s.statLabel}>Activos</Text>
            </View>
          </View>
        </View>

        {/* Wallet */}
        <View style={s.walletCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="wallet" size={24} color="#fff" />
            </View>
            <View>
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Mi billetera</Text>
              <Text style={{ fontSize: 28, fontWeight: '800', color: '#fff' }}>
                ${(wallet?.balance ?? 0).toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        {/* Active jobs - PROMINENT */}
        {activeJobs.length > 0 && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: '#00C853' }]}>Trabajos activos</Text>
            {activeJobs.map((job, i) => (
              <TouchableOpacity key={job.job_id || i} style={[s.jobRow, { borderLeftWidth: 3, borderLeftColor: job.status === 'assigned' ? '#00C853' : '#FF9500' }]}
                onPress={() => router.push({ pathname: '/(jobs)/job-status', params: { jobId: job.job_id } } as any)}
              >
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name={job.status === 'assigned' ? 'checkmark-circle' : 'search'} size={18} color={job.status === 'assigned' ? '#00C853' : '#FF9500'} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#1C1C1E' }}>{job.title || 'Trabajo'}</Text>
                  <Text style={{ fontSize: 12, color: '#8E8E93' }}>{job.category} · ${job.budget}</Text>
                </View>
                <View style={[s.badge, { backgroundColor: job.status === 'assigned' ? '#E8F5E9' : '#FFF3E0' }]}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: job.status === 'assigned' ? '#00C853' : '#FF9500' }}>
                    {job.status === 'assigned' ? 'En curso' : 'Buscando'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#C7C7CC" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Past jobs */}
        {pastJobs.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Historial</Text>
            {pastJobs.slice(0, 5).map((job, i) => (
              <TouchableOpacity key={job.job_id || i} style={s.jobRow}
                onPress={() => router.push({ pathname: '/(jobs)/job-status', params: { jobId: job.job_id } } as any)}
              >
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="briefcase" size={18} color="#8E8E93" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#1C1C1E' }}>{job.title || 'Trabajo'}</Text>
                  <Text style={{ fontSize: 12, color: '#8E8E93' }}>{job.category} · ${job.budget}</Text>
                </View>
                <View style={[s.badge, { backgroundColor: job.status === 'completed' ? '#E8F5E9' : '#FFF5F5' }]}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: job.status === 'completed' ? '#00C853' : '#FF3B30' }}>
                    {job.status === 'completed' ? 'Listo' : 'Cancelado'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Menu */}
        <View style={s.section}>
          <View style={s.menuCard}>
            <TouchableOpacity style={s.menuItem} onPress={() => router.push('/support')}>
              <View style={s.menuLeft}>
                <Ionicons name="help-circle-outline" size={22} color={GREEN} />
                <Text style={s.menuText}>Ayuda y soporte</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
            </TouchableOpacity>
            <View style={s.menuDivider} />
            <TouchableOpacity style={s.menuItem} onPress={() => Linking.openURL(`${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/legal/privacy`)}>
              <View style={s.menuLeft}>
                <Ionicons name="shield-checkmark-outline" size={22} color={GREEN} />
                <Text style={s.menuText}>Privacidad</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
            </TouchableOpacity>
            <View style={s.menuDivider} />
            <TouchableOpacity style={s.menuItem} onPress={() => Linking.openURL(`${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/legal/terms`)}>
              <View style={s.menuLeft}>
                <Ionicons name="document-text-outline" size={22} color={GREEN} />
                <Text style={s.menuText}>Términos</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Logout */}
        <View style={{ marginHorizontal: 16, marginTop: 8 }}>
          <TouchableOpacity
            style={s.logoutBtn}
            onPress={() => Alert.alert('Cerrar sesión', '¿Seguro?', [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Sí, salir', style: 'destructive', onPress: doLogout },
            ])}
          >
            <Ionicons name="log-out-outline" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Cerrar sesión</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ textAlign: 'center', fontSize: 12, color: '#8E8E93', marginTop: 16 }}>Moli Trabajos v1.0.0</Text>

        <TouchableOpacity
          style={{ marginHorizontal: 16, marginTop: 12, paddingVertical: 14, alignItems: 'center' }}
          onPress={() => Alert.alert('Eliminar cuenta', '¿Estás seguro? Esta acción es irreversible.', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Eliminar', style: 'destructive', onPress: async () => {
              try {
                await apiService.delete('/auth/delete-account?confirmation=ELIMINAR');
                Alert.alert('Cuenta eliminada');
                await logout();
                router.replace('/');
              } catch (e: any) { Alert.alert('Error', e.message); }
            }},
          ])}
        >
          <Text style={{ color: '#FF3B30', fontSize: 14, fontWeight: '600' }}>Eliminar mi cuenta</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginLeft: 12 },
  profileCard: { backgroundColor: '#fff', margin: 16, borderRadius: 20, padding: 24, alignItems: 'center' },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  userName: { fontSize: 22, fontWeight: '800', color: '#1C1C1E' },
  userEmail: { fontSize: 14, color: '#8E8E93', marginTop: 2 },
  statsRow: { flexDirection: 'row', marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#E5E5EA', width: '100%' },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800', color: '#1C1C1E' },
  statLabel: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  statDivider: { width: 1, backgroundColor: '#E5E5EA' },
  walletCard: { backgroundColor: '#00C853', marginHorizontal: 16, borderRadius: 20, padding: 20, marginBottom: 16 },
  section: { marginHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E', marginBottom: 8 },
  jobRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  menuCard: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuText: { fontSize: 15, color: '#1C1C1E', fontWeight: '500' },
  menuDivider: { height: 1, backgroundColor: '#E5E5EA', marginLeft: 50 },
  logoutBtn: { backgroundColor: '#FF3B30', paddingVertical: 14, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
});
