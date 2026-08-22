import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  ScrollView, FlatList, ActivityIndicator, RefreshControl, Alert, Platform, Modal, TextInput,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/src/services/api';

type Tab = 'dashboard' | 'jobs' | 'professionals' | 'map';

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'Abierto', color: '#FF9500', bg: '#FFF3E0' },
  assigned: { label: 'Asignado', color: '#007AFF', bg: '#E3F2FD' },
  in_progress: { label: 'En curso', color: '#FF7733', bg: '#FFF0EC' },
  completed: { label: 'Completado', color: '#34C759', bg: '#FFF0EC' },
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

  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [selectedPro, setSelectedPro] = useState<any>(null);
  const [editingPro, setEditingPro] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');

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
    Alert.alert('Cancelar trabajo', '¿Seguro que querés cancelar este trabajo?', [
      { text: 'No', style: 'cancel' },
      { text: 'Sí, cancelar', style: 'destructive', onPress: async () => {
        try {
          await apiService.put(`/jobs/${jobId}/status`, { status: 'cancelled' });
          setSelectedJob(null);
          loadAll();
          Alert.alert('Trabajo cancelado');
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  const handleSavePro = async () => {
    if (!editingPro) return;
    setSaving(true);
    try {
      // Update user info
      await apiService.put(`/admin/users/${editingPro.user_id}`, {
        name: editingPro.name,
        email: editingPro.email,
        phone: editingPro.phone,
      });
      // Update professional profile
      await apiService.put('/jobs/professional/profile', {
        categories: editingPro.categories,
        description: editingPro.description,
        hourly_rate: editingPro.hourly_rate,
        is_available: editingPro.is_available,
      });
      // Update wallet if changed
      if (editingPro._newBalance !== undefined) {
        await apiService.put(`/admin/users/${editingPro.user_id}/balance`, {
          balance: parseFloat(editingPro._newBalance),
          reason: 'Ajuste admin Moli Trabajos',
        });
      }
      Alert.alert('Profesional actualizado');
      setEditingPro(null);
      setSelectedPro(null);
      loadAll();
    } catch (e: any) { Alert.alert('Error', e.message); }
    setSaving(false);
  };

  const filteredJobs = filterStatus ? jobs.filter(j => j.status === filterStatus) : jobs;

  const getMapHtml = () => {
    const markers = professionals.filter(p => p.location).map(p =>
      `L.marker([${p.location.latitude},${p.location.longitude}],{icon:L.divIcon({html:'<div style="width:36px;height:36px;border-radius:12px;background:#FF7733;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.2)">${(p.name||'P')[0]}</div>',className:'',iconSize:[36,36]})}).addTo(map).bindPopup('<b>${p.name||'Profesional'}</b><br>${(p.categories||[]).join(', ')}<br>⭐ ${(p.rating||5).toFixed(1)}');`
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
      <View style={s.center}><ActivityIndicator size="large" color="#FF7733" /></View>
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
            <Ionicons name={t.icon as any} size={16} color={tab === t.id ? '#FF7733' : '#8E8E93'} />
            <Text style={[s.tabText, tab === t.id && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* DASHBOARD */}
      {tab === 'dashboard' && dashboard && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} tintColor="#FF7733" />}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={s.sectionTitle}>Moli Trabajos</Text>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FF3B30', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 }}
              onPress={() => { setPinInput(''); setShowPinModal(true); }}
            >
              <Ionicons name="refresh" size={14} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Reset trabajos</Text>
            </TouchableOpacity>
          </View>
          <View style={s.statsGrid}>
            {[
              { label: 'Total trabajos', value: dashboard.total_jobs, icon: 'briefcase', color: '#007AFF' },
              { label: 'Abiertos', value: dashboard.open_jobs, icon: 'time', color: '#FF9500' },
              { label: 'Asignados', value: dashboard.assigned_jobs, icon: 'person', color: '#5856D6' },
              { label: 'Completados', value: dashboard.completed_jobs, icon: 'checkmark-circle', color: '#FF7733' },
              { label: 'Cancelados', value: dashboard.cancelled_jobs, icon: 'close-circle', color: '#FF3B30' },
              { label: 'Profesionales', value: dashboard.total_professionals, icon: 'people', color: '#FF7733' },
              { label: 'Disponibles', value: dashboard.available_professionals, icon: 'radio-button-on', color: '#34C759' },
              { label: 'Facturación', value: `$${(dashboard.total_revenue || 0).toLocaleString()}`, icon: 'cash', color: '#FF7733' },
              { label: 'Comisión (15%)', value: `$${(dashboard.total_commission || 0).toLocaleString()}`, icon: 'trending-up', color: '#007AFF' },
              { label: 'Penalizaciones', value: `$${(dashboard.penalties_total || 0).toLocaleString()}`, icon: 'warning', color: '#FF9500' },
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
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} tintColor="#FF7733" />}
            ListEmptyComponent={<Text style={s.emptyText}>Sin trabajos</Text>}
            renderItem={({ item }) => {
              const st2 = STATUS_LABELS[item.status] || STATUS_LABELS.open;
              return (
                <TouchableOpacity style={s.jobCard} onPress={() => setSelectedJob(item)}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={s.jobTitle} numberOfLines={1}>{item.title || 'Sin título'}</Text>
                    <View style={[s.statusBadge, { backgroundColor: st2.bg }]}>
                      <Text style={[s.statusText, { color: st2.color }]}>{st2.label}</Text>
                    </View>
                  </View>
                  <Text style={s.jobMeta}>{item.category} · {item.client_name} · ${item.budget?.toLocaleString()}</Text>
                  {item.address ? <Text style={s.jobAddr} numberOfLines={1}>{item.address}</Text> : null}
                  {item.assigned_name ? <Text style={{ fontSize: 12, color: '#007AFF', marginTop: 2 }}>Profesional: {item.assigned_name}</Text> : null}
                  <Ionicons name="chevron-forward" size={16} color="#C7C7CC" style={{ position: 'absolute', right: 12, top: '50%' }} />
                </TouchableOpacity>
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} tintColor="#FF7733" />}
          ListEmptyComponent={<Text style={s.emptyText}>Sin profesionales registrados</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.proCard} onPress={() => setSelectedPro(item)}>
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
                <View style={[s.availDot, { backgroundColor: item.is_available ? '#FF7733' : '#FF3B30' }]} />
              </View>
              <Ionicons name="chevron-forward" size={16} color="#C7C7CC" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
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
              <View style={[s.legendDot, { backgroundColor: '#FF7733' }]} />
              <Text style={s.legendText}>Profesionales ({professionals.filter(p => p.location).length})</Text>
            </View>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: '#FF9500' }]} />
              <Text style={s.legendText}>Trabajos abiertos ({jobs.filter(j => j.status === 'open' && j.location).length})</Text>
            </View>
          </View>
        </View>
      )}

      {/* ═══ JOB DETAIL MODAL ═══ */}
      <Modal visible={!!selectedJob} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#1C1C1E' }}>Detalle del trabajo</Text>
              <TouchableOpacity onPress={() => setSelectedJob(null)}><Ionicons name="close-circle" size={28} color="#8E8E93" /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedJob && (
                <>
                  <View style={{ backgroundColor: (STATUS_LABELS[selectedJob.status]?.bg || '#F2F2F7'), borderRadius: 12, padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="ellipse" size={10} color={STATUS_LABELS[selectedJob.status]?.color || '#8E8E93'} />
                    <Text style={{ fontWeight: '700', color: STATUS_LABELS[selectedJob.status]?.color || '#8E8E93' }}>{STATUS_LABELS[selectedJob.status]?.label || selectedJob.status}</Text>
                  </View>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: '#1C1C1E' }}>{selectedJob.title}</Text>
                  <Text style={{ fontSize: 14, color: '#636366', marginTop: 4, lineHeight: 20 }}>{selectedJob.description}</Text>
                  <View style={{ flexDirection: 'row', gap: 16, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E5E5EA' }}>
                    <View><Text style={{ fontSize: 12, color: '#8E8E93' }}>Categoría</Text><Text style={{ fontSize: 14, fontWeight: '600' }}>{selectedJob.category}</Text></View>
                    <View><Text style={{ fontSize: 12, color: '#8E8E93' }}>Presupuesto</Text><Text style={{ fontSize: 14, fontWeight: '700', color: '#FF7733' }}>${selectedJob.budget?.toLocaleString()}</Text></View>
                    {selectedJob.commission ? <View><Text style={{ fontSize: 12, color: '#8E8E93' }}>Comisión</Text><Text style={{ fontSize: 14, fontWeight: '600', color: '#007AFF' }}>${selectedJob.commission}</Text></View> : null}
                  </View>
                  <View style={{ marginTop: 12 }}>
                    <Text style={{ fontSize: 12, color: '#8E8E93' }}>Cliente</Text>
                    <Text style={{ fontSize: 14, fontWeight: '600' }}>{selectedJob.client_name} ({selectedJob.client_id})</Text>
                  </View>
                  {selectedJob.assigned_name ? (
                    <View style={{ marginTop: 8 }}>
                      <Text style={{ fontSize: 12, color: '#8E8E93' }}>Profesional asignado</Text>
                      <Text style={{ fontSize: 14, fontWeight: '600' }}>{selectedJob.assigned_name} ({selectedJob.assigned_to})</Text>
                    </View>
                  ) : null}
                  {selectedJob.address ? <View style={{ marginTop: 8 }}><Text style={{ fontSize: 12, color: '#8E8E93' }}>Dirección</Text><Text style={{ fontSize: 14 }}>{selectedJob.address}</Text></View> : null}
                  {selectedJob.cancellation_penalty ? <View style={{ marginTop: 8 }}><Text style={{ fontSize: 12, color: '#8E8E93' }}>Penalización</Text><Text style={{ fontSize: 14, fontWeight: '600', color: '#FF3B30' }}>${selectedJob.cancellation_penalty}</Text></View> : null}
                  <Text style={{ fontSize: 11, color: '#8E8E93', marginTop: 12 }}>ID: {selectedJob.job_id}</Text>
                  <Text style={{ fontSize: 11, color: '#8E8E93' }}>Creado: {selectedJob.created_at ? new Date(selectedJob.created_at).toLocaleString('es') : '-'}</Text>
                </>
              )}
            </ScrollView>
            {selectedJob && !['completed', 'cancelled', 'expired'].includes(selectedJob.status) && (
              <TouchableOpacity style={{ backgroundColor: '#FF3B30', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 16 }} onPress={() => handleCancelJob(selectedJob.job_id)}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Cancelar este trabajo</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* ═══ PROFESSIONAL DETAIL MODAL ═══ */}
      <Modal visible={!!selectedPro && !editingPro} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#1C1C1E' }}>Profesional</Text>
              <TouchableOpacity onPress={() => setSelectedPro(null)}><Ionicons name="close-circle" size={28} color="#8E8E93" /></TouchableOpacity>
            </View>
            {selectedPro && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ alignItems: 'center', marginBottom: 16 }}>
                  <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#FFF0EC', justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: 28, fontWeight: '700', color: '#FF7733' }}>{(selectedPro.name || 'P')[0]}</Text>
                  </View>
                  <Text style={{ fontSize: 20, fontWeight: '700', marginTop: 8 }}>{selectedPro.name}</Text>
                  <Text style={{ fontSize: 14, color: '#8E8E93' }}>{selectedPro.email}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                    <Ionicons name="star" size={18} color="#FFD700" />
                    <Text style={{ fontSize: 16, fontWeight: '700' }}>{(selectedPro.rating || 5).toFixed(1)}</Text>
                    <Text style={{ fontSize: 13, color: '#8E8E93' }}> · {selectedPro.total_jobs || 0} trabajos</Text>
                  </View>
                  <View style={[{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 6 }, { backgroundColor: selectedPro.is_available ? '#FFF0EC' : '#FFEBEE' }]}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: selectedPro.is_available ? '#FF7733' : '#FF3B30' }}>{selectedPro.is_available ? 'Disponible' : 'No disponible'}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Categorías</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {(selectedPro.categories || []).length > 0 ? selectedPro.categories.map((c: string) => (
                    <View key={c} style={s.proCatChip}><Text style={s.proCatText}>{c}</Text></View>
                  )) : <Text style={{ color: '#8E8E93', fontSize: 13 }}>Sin categorías</Text>}
                </View>
                {selectedPro.description ? <><Text style={{ fontSize: 14, fontWeight: '700', marginBottom: 4 }}>Descripción</Text><Text style={{ fontSize: 14, color: '#636366', lineHeight: 20, marginBottom: 12 }}>{selectedPro.description}</Text></> : null}
                <Text style={{ fontSize: 11, color: '#8E8E93' }}>ID: {selectedPro.user_id}</Text>
              </ScrollView>
            )}
            <TouchableOpacity style={{ backgroundColor: '#FF7733', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 16 }} onPress={() => setEditingPro({ ...selectedPro, _newBalance: '' })}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Editar profesional</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ═══ EDIT PROFESSIONAL MODAL ═══ */}
      <Modal visible={!!editingPro} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 20, maxHeight: '90%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#1C1C1E' }}>Editar Profesional</Text>
              <TouchableOpacity onPress={() => setEditingPro(null)}><Ionicons name="close-circle" size={28} color="#8E8E93" /></TouchableOpacity>
            </View>
            {editingPro && (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#8E8E93', marginBottom: 4 }}>Nombre</Text>
                <TextInput style={s.editInput} value={editingPro.name || ''} onChangeText={t => setEditingPro({...editingPro, name: t})} placeholder="Nombre" />
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#8E8E93', marginBottom: 4, marginTop: 10 }}>Email</Text>
                <TextInput style={s.editInput} value={editingPro.email || ''} onChangeText={t => setEditingPro({...editingPro, email: t})} placeholder="Email" keyboardType="email-address" />
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#8E8E93', marginBottom: 4, marginTop: 10 }}>Teléfono</Text>
                <TextInput style={s.editInput} value={editingPro.phone || ''} onChangeText={t => setEditingPro({...editingPro, phone: t})} placeholder="Teléfono" keyboardType="phone-pad" />
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#8E8E93', marginBottom: 4, marginTop: 10 }}>Descripción</Text>
                <TextInput style={[s.editInput, { height: 60 }]} value={editingPro.description || ''} onChangeText={t => setEditingPro({...editingPro, description: t})} placeholder="Descripción" multiline />
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#8E8E93', marginBottom: 4, marginTop: 10 }}>Tarifa por hora ($)</Text>
                <TextInput style={s.editInput} value={String(editingPro.hourly_rate || '')} onChangeText={t => setEditingPro({...editingPro, hourly_rate: parseFloat(t) || 0})} placeholder="0" keyboardType="numeric" />
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#8E8E93', marginBottom: 4, marginTop: 10 }}>Ajustar saldo billetera ($)</Text>
                <TextInput style={s.editInput} value={editingPro._newBalance || ''} onChangeText={t => setEditingPro({...editingPro, _newBalance: t})} placeholder="Dejar vacío para no cambiar" keyboardType="numeric" />
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#8E8E93', marginBottom: 6, marginTop: 10 }}>Categorías</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {['electricista', 'plomero', 'limpieza', 'mudanza', 'pintura', 'jardineria', 'carpinteria', 'mecanica', 'tecnologia', 'otro'].map(cat => {
                    const sel = (editingPro.categories || []).includes(cat);
                    return (
                      <TouchableOpacity key={cat} style={[s.proCatChip, sel && { backgroundColor: '#FF7733', borderColor: '#FF7733' }]}
                        onPress={() => {
                          const cats = editingPro.categories || [];
                          setEditingPro({...editingPro, categories: sel ? cats.filter((c: string) => c !== cat) : [...cats, cat]});
                        }}>
                        <Text style={[s.proCatText, sel && { color: '#fff' }]}>{cat}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Text style={{ fontSize: 14, color: '#1C1C1E' }}>Disponible:</Text>
                  <TouchableOpacity onPress={() => setEditingPro({...editingPro, is_available: !editingPro.is_available})}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name={editingPro.is_available ? 'checkbox' : 'square-outline'} size={22} color={editingPro.is_available ? '#FF7733' : '#8E8E93'} />
                    <Text style={{ color: editingPro.is_available ? '#FF7733' : '#8E8E93', fontWeight: '600' }}>{editingPro.is_available ? 'Sí' : 'No'}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
            <TouchableOpacity style={{ backgroundColor: '#FF7733', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 12 }} onPress={handleSavePro} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Guardar cambios</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>


      {/* ═══ PIN SECURITY MODAL ═══ */}
      <Modal visible={showPinModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 320, alignItems: 'center' }}>
            <Ionicons name="lock-closed" size={32} color="#FF3B30" />
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#1C1C1E', marginTop: 8 }}>PIN de seguridad</Text>
            <Text style={{ fontSize: 13, color: '#8E8E93', marginTop: 4, textAlign: 'center' }}>Ingresá el PIN para resetear todos los trabajos</Text>
            <TextInput
              style={{ backgroundColor: '#F2F2F7', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 24, color: '#1C1C1E', width: '100%', textAlign: 'center', letterSpacing: 8, marginTop: 16, borderWidth: 1, borderColor: '#E5E5EA' }}
              value={pinInput}
              onChangeText={setPinInput}
              placeholder="····"
              placeholderTextColor="#C7C7CC"
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, width: '100%' }}>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E5EA', alignItems: 'center' }} onPress={() => { setShowPinModal(false); setPinInput(''); }}>
                <Text style={{ color: '#8E8E93', fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#FF3B30', alignItems: 'center' }} onPress={async () => {
                if (pinInput !== '0725') { Alert.alert('PIN incorrecto'); return; }
                setShowPinModal(false); setPinInput('');
                try {
                  const res = await apiService.delete('/admin/reset/jobs');
                  Alert.alert('Reset completo', `${res.modified || 0} trabajos cancelados`);
                  loadAll();
                } catch (e: any) { Alert.alert('Error', e.message); }
              }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabBar: { maxHeight: 48, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#FF7733' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#8E8E93' },
  tabTextActive: { color: '#FF7733' },
  sectionTitle: { fontSize: 22, fontWeight: '800', color: '#1C1C1E', marginBottom: 8 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '47%', backgroundColor: '#F8F8FA', borderRadius: 16, padding: 16, gap: 6 },
  statIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '800', color: '#1C1C1E' },
  statLabel: { fontSize: 12, color: '#8E8E93', fontWeight: '500' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F2F2F7' },
  filterChipActive: { backgroundColor: '#FF7733' },
  filterText: { fontSize: 12, fontWeight: '600', color: '#636366' },
  filterTextActive: { color: '#fff' },
  jobCard: { backgroundColor: '#F8F8FA', borderRadius: 14, padding: 14 },
  jobTitle: { fontSize: 15, fontWeight: '700', color: '#1C1C1E', flex: 1 },
  jobMeta: { fontSize: 12, color: '#8E8E93', marginTop: 4 },
  jobAddr: { fontSize: 12, color: '#636366', marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700' },
  proCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F8FA', borderRadius: 16, padding: 14, gap: 12 },
  proAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#FF7733', justifyContent: 'center', alignItems: 'center' },
  proAvatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  proName: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  proEmail: { fontSize: 12, color: '#8E8E93' },
  proCatChip: { backgroundColor: '#FFF0EC', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#FFF0EC' },
  proCatText: { fontSize: 10, fontWeight: '600', color: '#FF7733' },
  availDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  editInput: { backgroundColor: '#F2F2F7', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#1C1C1E', borderWidth: 1, borderColor: '#E5E5EA' },
  emptyText: { textAlign: 'center', color: '#8E8E93', marginTop: 40, fontSize: 15 },
  mapLegend: { position: 'absolute', bottom: 16, left: 16, right: 16, backgroundColor: '#fff', borderRadius: 12, padding: 12, flexDirection: 'row', gap: 16, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: '#636366', fontWeight: '500' },
});
