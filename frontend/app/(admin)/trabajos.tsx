import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  ScrollView, FlatList, ActivityIndicator, RefreshControl, Alert, Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/src/services/api';

type Tab = 'dashboard' | 'jobs' | 'professionals' | 'map';

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'Abierto', color: '#FF9500', bg: '#FFF3E0' },
  assigned: { label: 'Asignado', color: '#007AFF', bg: '#E3F2FD' },
  in_progress: { label: 'En curso', color: '#00C853', bg: '#E8F5E9' },
  completed: { label: 'Completado', color: '#34C759', bg: '#E8F5E9' },
  cancelled: { label: 'Cancelado', color: '#FF3B30', bg: '#FFEBEE' },
};

export default function AdminTrabajosScreen() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [dashRes, jobsRes, prosRes] = await Promise.all([
        apiService.get('/admin/jobs/dashboard'),
        apiService.get('/admin/jobs/all'),
        apiService.get('/admin/jobs/professionals'),
      ]);
      setDashboard(dashRes);
      setJobs(jobsRes.jobs || []);
      setProfessionals(prosRes.professionals || []);
    } catch (e) { console.log('Admin jobs error', e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const handleCancelJob = async (jobId: string) => {
    Alert.alert('Cancelar trabajo', '¿Seguro?', [
      { text: 'No', style: 'cancel' },
      { text: 'Sí, cancelar', style: 'destructive', onPress: async () => {
        try {
          await apiService.delete(`/admin/jobs/${jobId}`);
          loadAll();
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  const filteredJobs = filterStatus ? jobs.filter(j => j.status === filterStatus) : jobs;

  const getMapHtml = () => {
    const markers = professionals.filter(p => p.location).map(p =>
      `L.marker([${p.location.latitude},${p.location.longitude}],{icon:L.divIcon({html:'<div style="width:36px;height:36px;border-radius:12px;background:#00C853;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.2)">${(p.name||'P')[0]}</div>',className:'',iconSize:[36,36]})}).addTo(map).bindPopup('<b>${p.name||'Profesional'}</b><br>${(p.categories||[]).join(', ')}<br>⭐ ${(p.rating||5).toFixed(1)}');`
    ).join('\n');
    
    const jobMarkers = jobs.filter(j => j.location && j.status === 'open').map(j =>
      `L.marker([${j.location.latitude},${j.location.longitude}],{icon:L.divIcon({html:'<div style="width:32px;height:32px;border-radius:10px;background:#FF9500;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 6px rgba(0,0,0,0.15)">📋</div>',className:'',iconSize:[32,32]})}).addTo(map).bindPopup('<b>${(j.title||'').replace(/'/g,'')}</b><br>$${j.budget||0}');`
    ).join('\n');

    return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>body,html{margin:0;height:100%}#map{height:100%}</style>
</head><body><div id="map"></div><script>
var map=L.map('map',{zoomControl:false}).setView([-28.47,-65.78],12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
${markers}
${jobMarkers}
</script></body></html>`;
  };

  if (loading) return (
    <SafeAreaView style={s.container}>
      <View style={s.center}><ActivityIndicator size="large" color="#00C853" /></View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.container}>
      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={{ paddingHorizontal: 12, gap: 4 }}>
        {[
          { id: 'dashboard' as Tab, label: 'Dashboard', icon: 'grid' },
          { id: 'jobs' as Tab, label: 'Trabajos', icon: 'briefcase' },
          { id: 'professionals' as Tab, label: 'Profesionales', icon: 'people' },
          { id: 'map' as Tab, label: 'Mapa', icon: 'map' },
        ].map(t => (
          <TouchableOpacity key={t.id} style={[s.tab, tab === t.id && s.tabActive]} onPress={() => setTab(t.id)}>
            <Ionicons name={t.icon as any} size={16} color={tab === t.id ? '#00C853' : '#8E8E93'} />
            <Text style={[s.tabText, tab === t.id && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* DASHBOARD */}
      {tab === 'dashboard' && dashboard && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} tintColor="#00C853" />}>
          <Text style={s.sectionTitle}>Moli Trabajos</Text>
          <View style={s.statsGrid}>
            {[
              { label: 'Total trabajos', value: dashboard.total_jobs, icon: 'briefcase', color: '#007AFF' },
              { label: 'Abiertos', value: dashboard.open_jobs, icon: 'time', color: '#FF9500' },
              { label: 'Asignados', value: dashboard.assigned_jobs, icon: 'person', color: '#5856D6' },
              { label: 'Completados', value: dashboard.completed_jobs, icon: 'checkmark-circle', color: '#00C853' },
              { label: 'Cancelados', value: dashboard.cancelled_jobs, icon: 'close-circle', color: '#FF3B30' },
              { label: 'Profesionales', value: dashboard.total_professionals, icon: 'people', color: '#00C853' },
              { label: 'Disponibles', value: dashboard.available_professionals, icon: 'radio-button-on', color: '#34C759' },
              { label: 'Facturación', value: `$${(dashboard.total_revenue || 0).toLocaleString()}`, icon: 'cash', color: '#00C853' },
            ].map((st, i) => (
              <View key={i} style={s.statCard}>
                <View style={[s.statIcon, { backgroundColor: st.color + '18' }]}>
                  <Ionicons name={st.icon as any} size={20} color={st.color} />
                </View>
                <Text style={s.statValue}>{st.value}</Text>
                <Text style={s.statLabel}>{st.label}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* JOBS LIST */}
      {tab === 'jobs' && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }} contentContainerStyle={{ paddingHorizontal: 12, gap: 6, alignItems: 'center' }}>
            <TouchableOpacity style={[s.filterChip, !filterStatus && s.filterChipActive]} onPress={() => setFilterStatus(null)}>
              <Text style={[s.filterText, !filterStatus && s.filterTextActive]}>Todos ({jobs.length})</Text>
            </TouchableOpacity>
            {Object.entries(STATUS_LABELS).map(([key, val]) => {
              const count = jobs.filter(j => j.status === key).length;
              return (
                <TouchableOpacity key={key} style={[s.filterChip, filterStatus === key && s.filterChipActive]} onPress={() => setFilterStatus(key)}>
                  <Text style={[s.filterText, filterStatus === key && s.filterTextActive]}>{val.label} ({count})</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <FlatList
            data={filteredJobs}
            keyExtractor={item => item.job_id}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} tintColor="#00C853" />}
            ListEmptyComponent={<Text style={s.emptyText}>Sin trabajos</Text>}
            renderItem={({ item }) => {
              const st2 = STATUS_LABELS[item.status] || STATUS_LABELS.open;
              return (
                <View style={s.jobCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={s.jobTitle} numberOfLines={1}>{item.title || 'Sin título'}</Text>
                    <View style={[s.statusBadge, { backgroundColor: st2.bg }]}>
                      <Text style={[s.statusText, { color: st2.color }]}>{st2.label}</Text>
                    </View>
                  </View>
                  <Text style={s.jobMeta}>{item.category} · {item.client_name} · ${item.budget?.toLocaleString()}</Text>
                  {item.address ? <Text style={s.jobAddr} numberOfLines={1}>{item.address}</Text> : null}
                  {item.status === 'open' && (
                    <TouchableOpacity onPress={() => handleCancelJob(item.job_id)} style={{ alignSelf: 'flex-end', marginTop: 6 }}>
                      <Text style={{ color: '#FF3B30', fontSize: 13, fontWeight: '600' }}>Cancelar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            }}
          />
        </>
      )}

      {/* PROFESSIONALS */}
      {tab === 'professionals' && (
        <FlatList
          data={professionals}
          keyExtractor={item => item.user_id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} tintColor="#00C853" />}
          ListEmptyComponent={<Text style={s.emptyText}>Sin profesionales registrados</Text>}
          renderItem={({ item }) => (
            <View style={s.proCard}>
              <View style={s.proAvatar}>
                <Text style={s.proAvatarText}>{(item.name || 'P')[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.proName}>{item.name || 'Profesional'}</Text>
                <Text style={s.proEmail}>{item.email}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                  {(item.categories || []).map((c: string) => (
                    <View key={c} style={s.proCatChip}><Text style={s.proCatText}>{c}</Text></View>
                  ))}
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Ionicons name="star" size={14} color="#FFD700" />
                  <Text style={{ fontSize: 14, fontWeight: '700' }}>{(item.rating || 5).toFixed(1)}</Text>
                </View>
                <Text style={{ fontSize: 11, color: '#8E8E93', marginTop: 2 }}>{item.total_jobs || 0} trabajos</Text>
                <View style={[s.availDot, { backgroundColor: item.is_available ? '#00C853' : '#FF3B30' }]} />
              </View>
            </View>
          )}
        />
      )}

      {/* MAP */}
      {tab === 'map' && (
        <View style={{ flex: 1 }}>
          {Platform.OS === 'web' ? (
            <iframe srcDoc={getMapHtml()} style={{ width: '100%', height: '100%', border: 'none' } as any} />
          ) : (
            <WebView source={{ html: getMapHtml() }} style={{ flex: 1 }} javaScriptEnabled />
          )}
          <View style={s.mapLegend}>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: '#00C853' }]} />
              <Text style={s.legendText}>Profesionales ({professionals.filter(p => p.location).length})</Text>
            </View>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: '#FF9500' }]} />
              <Text style={s.legendText}>Trabajos abiertos ({jobs.filter(j => j.status === 'open' && j.location).length})</Text>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabBar: { maxHeight: 48, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#00C853' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#8E8E93' },
  tabTextActive: { color: '#00C853' },
  sectionTitle: { fontSize: 22, fontWeight: '800', color: '#1C1C1E', marginBottom: 8 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '47%', backgroundColor: '#F8F8FA', borderRadius: 16, padding: 16, gap: 6 },
  statIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '800', color: '#1C1C1E' },
  statLabel: { fontSize: 12, color: '#8E8E93', fontWeight: '500' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F2F2F7' },
  filterChipActive: { backgroundColor: '#00C853' },
  filterText: { fontSize: 12, fontWeight: '600', color: '#636366' },
  filterTextActive: { color: '#fff' },
  jobCard: { backgroundColor: '#F8F8FA', borderRadius: 14, padding: 14 },
  jobTitle: { fontSize: 15, fontWeight: '700', color: '#1C1C1E', flex: 1 },
  jobMeta: { fontSize: 12, color: '#8E8E93', marginTop: 4 },
  jobAddr: { fontSize: 12, color: '#636366', marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700' },
  proCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F8FA', borderRadius: 16, padding: 14, gap: 12 },
  proAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#00C853', justifyContent: 'center', alignItems: 'center' },
  proAvatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  proName: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  proEmail: { fontSize: 12, color: '#8E8E93' },
  proCatChip: { backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  proCatText: { fontSize: 10, fontWeight: '600', color: '#00C853' },
  availDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  emptyText: { textAlign: 'center', color: '#8E8E93', marginTop: 40, fontSize: 15 },
  mapLegend: { position: 'absolute', bottom: 16, left: 16, right: 16, backgroundColor: '#fff', borderRadius: 12, padding: 12, flexDirection: 'row', gap: 16, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: '#636366', fontWeight: '500' },
});
