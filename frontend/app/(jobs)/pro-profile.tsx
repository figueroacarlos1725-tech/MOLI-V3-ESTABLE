import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, Switch, ActivityIndicator, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiService } from '@/src/services/api';
import { useAuthStore } from '@/src/stores/authStore';

const GREEN = '#FF5A3C';

const CATEGORY_OPTIONS = [
  { id: 'electricista', name: 'Electricista', icon: 'flash', color: '#FF9500' },
  { id: 'plomero', name: 'Plomero', icon: 'water', color: '#007AFF' },
  { id: 'limpieza', name: 'Limpieza', icon: 'sparkles', color: '#34C759' },
  { id: 'mudanza', name: 'Mudanza', icon: 'cube', color: '#AF52DE' },
  { id: 'pintura', name: 'Pintura', icon: 'color-palette', color: '#FF3B30' },
  { id: 'jardineria', name: 'Jardinería', icon: 'leaf', color: '#FF5A3C' },
  { id: 'carpinteria', name: 'Carpintería', icon: 'hammer', color: '#8B4513' },
  { id: 'mecanica', name: 'Mecánica', icon: 'construct', color: '#636366' },
  { id: 'tecnologia', name: 'Tecnología', icon: 'laptop', color: '#5856D6' },
  { id: 'otro', name: 'Otro', icon: 'ellipsis-horizontal', color: '#8E8E93' },
];

export default function ProProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuthStore();
  const [profile, setProfile] = useState<any>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [myJobs, setMyJobs] = useState<any[]>([]);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    try {
      const [profRes, walletRes, jobsRes] = await Promise.all([
        apiService.get('/jobs/professional/profile'),
        apiService.get('/wallet/status').catch(() => ({ balance: 0 })),
        apiService.get('/jobs/my-offers').catch(() => ({ offers: [] })),
      ]);
      setProfile(profRes.profile || null);
      setWallet(walletRes);
      setMyJobs(jobsRes.offers || []);
    } catch (e) { console.log('Profile load error:', e); }
    setLoading(false);
  };

  const doLogout = async () => {
    try { await logout(); } catch {}
    router.replace('/(auth)/welcome' as any);
  };

  const completedJobs = myJobs.filter(j => j.job_status === 'completed').length;
  const activeJobs = myJobs.filter(j => j.job_status === 'assigned' || j.job_status === 'in_progress').length;

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
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Mi Perfil Profesional</Text>
        </View>

        {/* Profile Card */}
        <View style={s.profileCard}>
          <View style={s.avatarWrap}>
            <View style={s.avatar}>
              <Ionicons name="person" size={40} color={GREEN} />
            </View>
            {profile?.is_available && (
              <View style={s.onlineBadge}>
                <Ionicons name="checkmark" size={12} color="#fff" />
              </View>
            )}
          </View>
          <Text style={s.userName}>{user?.name || 'Profesional'}</Text>
          <Text style={s.userEmail}>{user?.email}</Text>
          <View style={s.statsRow}>
            <View style={s.statItem}>
              <Text style={s.statValue}>{completedJobs}</Text>
              <Text style={s.statLabel}>Trabajos</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="star" size={16} color="#FFD700" />
                <Text style={s.statValue}>{profile?.rating?.toFixed(1) || '5.0'}</Text>
              </View>
              <Text style={s.statLabel}>Calificación</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statValue}>{activeJobs}</Text>
              <Text style={s.statLabel}>Activos</Text>
            </View>
          </View>
        </View>

        {/* Wallet Card */}
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
          {profile?.hourly_rate > 0 && (
            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)' }}>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Tarifa por hora</Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff' }}>${profile.hourly_rate}/hr</Text>
            </View>
          )}
        </View>

        {/* Categories */}
        <View style={s.section}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={s.sectionTitle}>Mis categorías</Text>
            <TouchableOpacity onPress={() => router.push('/(jobs)/setup-profile')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="pencil" size={16} color={GREEN} />
              <Text style={{ color: GREEN, fontWeight: '600', fontSize: 13 }}>Editar</Text>
            </TouchableOpacity>
          </View>
          <View style={s.catGrid}>
            {(profile?.categories || []).length > 0 ? (
              profile.categories.map((catId: string) => {
                const cat = CATEGORY_OPTIONS.find(c => c.id === catId);
                if (!cat) return null;
                return (
                  <View key={catId} style={s.catChip}>
                    <Ionicons name={cat.icon as any} size={16} color={cat.color} />
                    <Text style={s.catChipText}>{cat.name}</Text>
                  </View>
                );
              })
            ) : (
              <TouchableOpacity style={s.emptyCatBtn} onPress={() => router.push('/(jobs)/setup-profile')}>
                <Ionicons name="add-circle" size={24} color={GREEN} />
                <Text style={{ color: GREEN, fontWeight: '600', fontSize: 14 }}>Agregar categorías</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Description */}
        {profile?.description ? (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Sobre mí</Text>
            <View style={s.descCard}>
              <Text style={s.descText}>{profile.description}</Text>
            </View>
          </View>
        ) : null}

        {/* Recent jobs */}
        {myJobs.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Trabajos recientes</Text>
            {myJobs.slice(0, 5).map((job, i) => (
              <View key={i} style={s.jobRow}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="briefcase" size={18} color="#636366" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#1C1C1E' }}>{job.job_title || 'Trabajo'}</Text>
                  <Text style={{ fontSize: 12, color: '#8E8E93' }}>{job.job_category} · {job.job_status || 'pendiente'}</Text>
                </View>
                <View style={[s.statusBadge, { backgroundColor: job.job_status === 'completed' ? '#FFF0EC' : job.job_status === 'assigned' ? '#FFF3E0' : '#F2F2F7' }]}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: job.job_status === 'completed' ? GREEN : job.job_status === 'assigned' ? '#FF9500' : '#8E8E93' }}>
                    {job.job_status === 'completed' ? 'Completado' : job.job_status === 'assigned' ? 'Activo' : job.job_status || 'Pendiente'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Menu items */}
        <View style={s.section}>
          <View style={s.menuCard}>
            <TouchableOpacity style={s.menuItem} onPress={() => router.push('/(jobs)/setup-profile')}>
              <View style={s.menuLeft}>
                <Ionicons name="create-outline" size={22} color={GREEN} />
                <Text style={s.menuText}>Editar perfil</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
            </TouchableOpacity>
            <View style={s.menuDivider} />
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
              setDeleting(true);
              try {
                await apiService.delete('/auth/delete-account?confirmation=ELIMINAR');
                Alert.alert('Cuenta eliminada');
                await logout();
                router.replace('/');
              } catch (e: any) { Alert.alert('Error', e.message); }
              setDeleting(false);
            }},
          ])}
        >
          <Text style={{ color: '#FF3B30', fontSize: 14, fontWeight: '600' }}>
            {deleting ? 'Eliminando...' : 'Eliminar mi cuenta'}
          </Text>
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
  avatarWrap: { position: 'relative', marginBottom: 12 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#FFF0EC', justifyContent: 'center', alignItems: 'center' },
  onlineBadge: { position: 'absolute', bottom: 2, right: 2, width: 26, height: 26, borderRadius: 13, backgroundColor: GREEN, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#fff' },
  userName: { fontSize: 22, fontWeight: '800', color: '#1C1C1E' },
  userEmail: { fontSize: 14, color: '#8E8E93', marginTop: 2 },
  statsRow: { flexDirection: 'row', marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#E5E5EA', width: '100%' },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800', color: '#1C1C1E' },
  statLabel: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  statDivider: { width: 1, backgroundColor: '#E5E5EA' },
  walletCard: { backgroundColor: GREEN, marginHorizontal: 16, borderRadius: 20, padding: 20, marginBottom: 16 },
  section: { marginHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E', marginBottom: 8 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E5E5EA' },
  catChipText: { fontSize: 13, fontWeight: '600', color: '#1C1C1E' },
  emptyCatBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E5E5EA', borderStyle: 'dashed' },
  descCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  descText: { fontSize: 14, color: '#636366', lineHeight: 20 },
  jobRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 6 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  menuCard: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuText: { fontSize: 15, color: '#1C1C1E', fontWeight: '500' },
  menuDivider: { height: 1, backgroundColor: '#E5E5EA', marginLeft: 50 },
  logoutBtn: { backgroundColor: '#FF3B30', paddingVertical: 14, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
});
