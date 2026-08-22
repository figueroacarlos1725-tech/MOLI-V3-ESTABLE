import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  FlatList, ActivityIndicator, TextInput, Modal, Alert, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/src/services/api';

export default function AdminMessagesScreen() {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [ratings, setRatings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'send' | 'ratings'>('send');
  const [showCompose, setShowCompose] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [broadcastMode, setBroadcastMode] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersRes, ratingsRes] = await Promise.all([
        apiService.get('/admin/users?user_type=driver'),
        apiService.get('/admin/ratings?limit=30'),
      ]);
      setDrivers(usersRes.users || []);
      setRatings(ratingsRes.ratings || []);
    } catch (e) { console.log('Load error', e); }
    finally { setLoading(false); }
  };

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      Alert.alert('Error', 'Completá asunto y mensaje');
      return;
    }
    setSending(true);
    try {
      if (broadcastMode) {
        // Send to all drivers
        let sent = 0;
        for (const d of drivers) {
          try {
            await apiService.post('/inbox/send', {
              recipient_id: d.user_id,
              subject: subject.trim(),
              body: body.trim(),
            });
            sent++;
          } catch(e) {}
        }
        Alert.alert('Enviado', `Mensaje enviado a ${sent} conductores`);
      } else if (selectedDriver) {
        await apiService.post('/inbox/send', {
          recipient_id: selectedDriver.user_id,
          subject: subject.trim(),
          body: body.trim(),
        });
        Alert.alert('Enviado', `Mensaje enviado a ${selectedDriver.name}`);
      }
      setShowCompose(false);
      setSubject('');
      setBody('');
      setSelectedDriver(null);
      setBroadcastMode(false);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo enviar');
    } finally { setSending(false); }
  };

  if (loading) return (
    <SafeAreaView style={s.container}>
      <View style={s.center}><ActivityIndicator size="large" color="#FF5A3C" /></View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.container}>
      {/* Tabs */}
      <View style={s.tabs}>
        <TouchableOpacity style={[s.tab, tab === 'send' && s.tabActive]} onPress={() => setTab('send')}>
          <Ionicons name="mail" size={18} color={tab === 'send' ? '#FF5A3C' : '#8E8E93'} />
          <Text style={[s.tabText, tab === 'send' && s.tabTextActive]}>Mensajes</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, tab === 'ratings' && s.tabActive]} onPress={() => setTab('ratings')}>
          <Ionicons name="star" size={18} color={tab === 'ratings' ? '#FF5A3C' : '#8E8E93'} />
          <Text style={[s.tabText, tab === 'ratings' && s.tabTextActive]}>Calificaciones</Text>
        </TouchableOpacity>
      </View>

      {tab === 'send' ? (
        <View style={{ flex: 1 }}>
          {/* Action buttons */}
          <View style={{ flexDirection: 'row', gap: 10, padding: 16 }}>
            <TouchableOpacity
              style={s.actionBtn}
              onPress={() => { setBroadcastMode(true); setShowCompose(true); }}
            >
              <Ionicons name="megaphone" size={20} color="#fff" />
              <Text style={s.actionBtnText}>Enviar a todos</Text>
            </TouchableOpacity>
          </View>

          {/* Driver list */}
          <Text style={s.sectionTitle}>Conductores ({drivers.length})</Text>
          <FlatList
            data={drivers}
            keyExtractor={(item) => item.user_id}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={s.driverCard}
                onPress={() => { setSelectedDriver(item); setBroadcastMode(false); setShowCompose(true); }}
              >
                <View style={s.driverAvatar}>
                  <Text style={s.driverAvatarText}>{(item.name || 'D')[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.driverName}>{item.name}</Text>
                  <Text style={s.driverEmail}>{item.email}</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <Ionicons name="star" size={14} color="#FFD700" />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#1C1C1E' }}>{(item.rating || 5.0).toFixed(1)}</Text>
                  </View>
                  <Ionicons name="mail-outline" size={18} color="#FF5A3C" style={{ marginTop: 4 }} />
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      ) : (
        <FlatList
          data={ratings}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          ListEmptyComponent={<Text style={s.emptyText}>Sin calificaciones aún</Text>}
          renderItem={({ item }) => (
            <View style={s.ratingCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {[1,2,3,4,5].map(star => (
                  <Ionicons key={star} name={star <= item.rating ? 'star' : 'star-outline'} size={16} color="#FFD700" />
                ))}
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1C1C1E', marginLeft: 4 }}>{item.rating}/5</Text>
              </View>
              <Text style={{ fontSize: 13, color: '#636366', marginTop: 4 }}>
                {item.rater_name} → {item.rated_name}
              </Text>
              <Text style={{ fontSize: 11, color: '#C7C7CC', marginTop: 2 }}>
                {item.created_at ? new Date(item.created_at).toLocaleDateString('es-AR') : ''}
              </Text>
            </View>
          )}
        />
      )}

      {/* Compose modal */}
      <Modal visible={showCompose} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>
                {broadcastMode ? 'Mensaje a todos los conductores' : `Mensaje a ${selectedDriver?.name || ''}`}
              </Text>
              <TouchableOpacity onPress={() => setShowCompose(false)}>
                <Ionicons name="close" size={24} color="#636366" />
              </TouchableOpacity>
            </View>
            <TextInput style={s.input} placeholder="Asunto" placeholderTextColor="#8E8E93" value={subject} onChangeText={setSubject} />
            <TextInput style={[s.input, s.bodyInput]} placeholder="Escribí tu mensaje..." placeholderTextColor="#8E8E93" value={body} onChangeText={setBody} multiline textAlignVertical="top" />
            <TouchableOpacity
              style={[s.sendBtn, (!subject.trim() || !body.trim()) && s.sendBtnDisabled]}
              onPress={handleSend}
              disabled={sending}
            >
              {sending ? <ActivityIndicator color="#fff" /> : (
                <Text style={s.sendBtnText}>{broadcastMode ? 'Enviar a todos' : 'Enviar'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#FF5A3C' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#8E8E93' },
  tabTextActive: { color: '#FF5A3C' },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FF5A3C', paddingVertical: 14, borderRadius: 14 },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#8E8E93', paddingHorizontal: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  driverCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F8FA', borderRadius: 14, padding: 14, gap: 12 },
  driverAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FF5A3C', justifyContent: 'center', alignItems: 'center' },
  driverAvatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  driverName: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  driverEmail: { fontSize: 12, color: '#8E8E93', marginTop: 1 },
  ratingCard: { backgroundColor: '#F8F8FA', borderRadius: 12, padding: 14 },
  emptyText: { textAlign: 'center', color: '#8E8E93', marginTop: 40, fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#1C1C1E', flex: 1 },
  input: { backgroundColor: '#F2F2F7', borderRadius: 12, padding: 14, fontSize: 15, color: '#1C1C1E', marginBottom: 12 },
  bodyInput: { minHeight: 120 },
  sendBtn: { backgroundColor: '#FF5A3C', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
