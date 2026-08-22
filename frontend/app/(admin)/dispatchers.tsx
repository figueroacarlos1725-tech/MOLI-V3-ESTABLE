import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView,
  ActivityIndicator, TextInput, Alert, Switch, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiService } from '@/src/services/api';

const PERMISSIONS = [
  { key: 'create_rides', label: 'Crear viajes', icon: 'add-circle', category: 'Gestión de pedidos' },
  { key: 'view_realtime_rides', label: 'Ver viajes en tiempo real', icon: 'pulse', category: 'Gestión de pedidos' },
  { key: 'edit_rides', label: 'Editar viajes', icon: 'create', category: 'Gestión de pedidos' },
  { key: 'cancel_rides', label: 'Cancelar viajes', icon: 'close-circle', category: 'Gestión de pedidos' },
  { key: 'view_completed_rides', label: 'Ver viajes terminados', icon: 'checkmark-circle', category: 'Gestión de pedidos' },
  { key: 'view_live_map', label: 'Ver mapa en vivo', icon: 'map', category: 'Acceso a secciones' },
  { key: 'view_statistics', label: 'Ver estadísticas', icon: 'stats-chart', category: 'Acceso a secciones' },
  { key: 'view_drivers', label: 'Ver información de conductores', icon: 'eye', category: 'Perfil del conductor' },
  { key: 'edit_drivers', label: 'Editar conductores', icon: 'pencil', category: 'Perfil del conductor' },
  { key: 'create_drivers', label: 'Crear conductores', icon: 'person-add', category: 'Perfil del conductor' },
  { key: 'block_drivers', label: 'Bloquear conductores', icon: 'ban', category: 'Perfil del conductor' },
  { key: 'add_driver_balance', label: 'Agregar saldo a conductores', icon: 'add', category: 'Gestión financiera' },
  { key: 'remove_driver_balance', label: 'Quitar saldo a conductores', icon: 'remove', category: 'Gestión financiera' },
  { key: 'manage_clients', label: 'Gestionar clientes', icon: 'people', category: 'Gestión de clientes' },
];

export default function DispatchersScreen() {
  const router = useRouter();
  const [dispatchers, setDispatchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showPerms, setShowPerms] = useState<any>(null);
  const [newDisp, setNewDisp] = useState({ name: '', email: '', phone: '', password: '' });
  const [editPerms, setEditPerms] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const fetchDispatchers = async () => {
    try {
      const data = await apiService.get('/admin/dispatchers');
      setDispatchers(data?.dispatchers || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchDispatchers(); }, []);

  const handleCreate = async () => {
    if (!newDisp.name || !newDisp.email || !newDisp.password) {
      Alert.alert('Error', 'Completá nombre, email y contraseña'); return;
    }
    setSaving(true);
    try {
      await apiService.post('/admin/users', { ...newDisp, user_type: 'dispatcher' });
      Alert.alert('Despachador creado', `${newDisp.name} fue creado`);
      setShowCreate(false); setNewDisp({ name: '', email: '', phone: '', password: '' });
      fetchDispatchers();
    } catch (e: any) { Alert.alert('Error', e.message); }
    setSaving(false);
  };

  const handleSavePerms = async () => {
    if (!showPerms) return;
    setSaving(true);
    try {
      await apiService.put(`/admin/dispatchers/${showPerms.user_id}/permissions`, editPerms);
      Alert.alert('Permisos guardados');
      setShowPerms(null); fetchDispatchers();
    } catch (e: any) { Alert.alert('Error', e.message); }
    setSaving(false);
  };

  const openPerms = (d: any) => {
    const perms = d.dispatcher_permissions || {};
    const full: Record<string, boolean> = {};
    PERMISSIONS.forEach(p => { full[p.key] = perms[p.key] ?? false; });
    setEditPerms(full);
    setShowPerms(d);
  };

  const categories = [...new Set(PERMISSIONS.map(p => p.category))];

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Despachadores</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowCreate(true)}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.addBtnText}>Nuevo</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={s.body}>
        {loading ? <ActivityIndicator size="large" color="#FF7733" style={{ marginTop: 40 }} /> : (
          dispatchers.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="people-outline" size={48} color="#636366" />
              <Text style={s.emptyText}>No hay despachadores creados</Text>
              <Text style={s.emptySubtext}>Creá uno con el botón «Nuevo»</Text>
            </View>
          ) : (
            dispatchers.map((d) => {
              const perms = d.dispatcher_permissions || {};
              const activeCount = Object.values(perms).filter(Boolean).length;
              return (
                <TouchableOpacity key={d.user_id} style={s.dispCard} onPress={() => openPerms(d)}>
                  <View style={s.dispAvatar}>
                    <Ionicons name="headset" size={24} color="#FF7733" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.dispName}>{d.name || d.email}</Text>
                    <Text style={s.dispEmail}>{d.email}</Text>
                    <Text style={s.dispPermsCount}>{activeCount}/{PERMISSIONS.length} permisos activos</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#636366" />
                </TouchableOpacity>
              );
            })
          )
        )}
      </ScrollView>

      {/* Create dispatcher modal */}
      <Modal visible={showCreate} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Nuevo Despachador</Text>
            <Text style={s.inputLabel}>Nombre</Text>
            <TextInput style={s.input} value={newDisp.name} onChangeText={t => setNewDisp(p => ({ ...p, name: t }))} placeholder="Nombre completo" placeholderTextColor="#555" />
            <Text style={s.inputLabel}>Email</Text>
            <TextInput style={s.input} value={newDisp.email} onChangeText={t => setNewDisp(p => ({ ...p, email: t }))} placeholder="email@ejemplo.com" placeholderTextColor="#555" keyboardType="email-address" autoCapitalize="none" />
            <Text style={s.inputLabel}>Teléfono</Text>
            <TextInput style={s.input} value={newDisp.phone} onChangeText={t => setNewDisp(p => ({ ...p, phone: t }))} placeholder="3834..." placeholderTextColor="#555" keyboardType="phone-pad" />
            <Text style={s.inputLabel}>Contraseña</Text>
            <TextInput style={s.input} value={newDisp.password} onChangeText={t => setNewDisp(p => ({ ...p, password: t }))} placeholder="••••••" placeholderTextColor="#555" secureTextEntry />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: '#333' }]} onPress={() => setShowCreate(false)}><Text style={s.modalBtnText}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: '#FF7733' }]} onPress={handleCreate} disabled={saving}>{saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.modalBtnText}>Crear</Text>}</TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Permissions modal */}
      <Modal visible={!!showPerms} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { maxHeight: '90%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={s.modalTitle}>Permisos: {showPerms?.name}</Text>
              <TouchableOpacity onPress={() => setShowPerms(null)}><Ionicons name="close" size={24} color="#8E8E93" /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {categories.map(cat => (
                <View key={cat} style={s.permCategory}>
                  <Text style={s.permCatTitle}>{cat}</Text>
                  {PERMISSIONS.filter(p => p.category === cat).map(perm => (
                    <View key={perm.key} style={s.permRow}>
                      <Ionicons name={perm.icon as any} size={18} color={editPerms[perm.key] ? '#FF7733' : '#555'} />
                      <Text style={[s.permLabel, editPerms[perm.key] && { color: '#fff' }]}>{perm.label}</Text>
                      <Switch
                        value={editPerms[perm.key] || false}
                        onValueChange={(v) => setEditPerms(p => ({ ...p, [perm.key]: v }))}
                        trackColor={{ false: '#333', true: '#FF7733' }}
                        thumbColor={editPerms[perm.key] ? '#FF7733' : '#666'}
                      />
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={[s.modalBtn, { backgroundColor: '#FF7733', marginTop: 12 }]} onPress={handleSavePerms} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.modalBtnText}>Guardar permisos</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1D23', paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: '#2A2F38' },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#2A2F38', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: '#E5E5EA' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FF7733', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  body: { flex: 1, padding: 16 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 16, color: '#8E8E93', fontWeight: '600' },
  emptySubtext: { fontSize: 13, color: '#636366' },
  dispCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1D23', borderRadius: 12, padding: 14, marginBottom: 8, gap: 12, borderWidth: 1, borderColor: '#2A2F38' },
  dispAvatar: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(123,45,142,0.15)', justifyContent: 'center', alignItems: 'center' },
  dispName: { fontSize: 15, fontWeight: '700', color: '#E5E5EA' },
  dispEmail: { fontSize: 12, color: '#8E8E93' },
  dispPermsCount: { fontSize: 11, color: '#FF7733', fontWeight: '600', marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContent: { backgroundColor: '#1A1D23', borderRadius: 16, width: '100%', maxWidth: 420, padding: 20, borderWidth: 1, borderColor: '#2A2F38' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#E5E5EA', marginBottom: 8 },
  inputLabel: { fontSize: 11, fontWeight: '700', color: '#8E8E93', marginBottom: 4, marginTop: 10, textTransform: 'uppercase' },
  input: { backgroundColor: '#2A2F38', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#E5E5EA', borderWidth: 1, borderColor: '#333' },
  modalBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 8 },
  modalBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  permCategory: { marginBottom: 16 },
  permCatTitle: { fontSize: 12, fontWeight: '800', color: '#FF7733', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2A2F38' },
  permLabel: { flex: 1, fontSize: 14, color: '#8E8E93', fontWeight: '500' },
});
