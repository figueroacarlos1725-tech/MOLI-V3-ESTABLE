import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  FlatList, ActivityIndicator, RefreshControl, TextInput, Modal, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/src/services/api';

export default function DriverInboxScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const fetchInbox = useCallback(async () => {
    try {
      const res = await apiService.get('/inbox');
      setMessages(res.messages || []);
    } catch (e) { console.log('Inbox error:', e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchInbox(); }, []);

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      Alert.alert('Error', 'Completá asunto y mensaje');
      return;
    }
    setSending(true);
    try {
      await apiService.post('/inbox/send', {
        recipient_id: 'admin',
        subject: subject.trim(),
        body: body.trim(),
      });
      setShowCompose(false);
      setSubject('');
      setBody('');
      fetchInbox();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo enviar');
    } finally { setSending(false); }
  };

  const markRead = async (id: string) => {
    try { await apiService.put(`/inbox/${id}/read`); } catch(e) {}
  };

  const renderMessage = ({ item }: { item: any }) => {
    const isFromMe = item.sender_type === 'driver';
    const date = item.created_at ? new Date(item.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    
    return (
      <TouchableOpacity
        style={[styles.msgCard, !item.is_read && !isFromMe && styles.msgUnread]}
        onPress={() => {
          if (!item.is_read && !isFromMe) markRead(item.message_id);
          Alert.alert(item.subject, `${item.body}\n\nDe: ${item.sender_name}\n${date}`);
        }}
      >
        <View style={styles.msgHeader}>
          <View style={[styles.avatar, isFromMe ? styles.avatarSent : styles.avatarReceived]}>
            <Ionicons name={isFromMe ? 'arrow-up' : 'arrow-down'} size={14} color="#fff" />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.msgSubject} numberOfLines={1}>{item.subject}</Text>
            <Text style={styles.msgFrom} numberOfLines={1}>
              {isFromMe ? 'Enviado por vos' : `De: ${item.sender_name}`}
            </Text>
          </View>
          {!item.is_read && !isFromMe && <View style={styles.unreadDot} />}
        </View>
        <Text style={styles.msgBody} numberOfLines={2}>{item.body}</Text>
        <Text style={styles.msgDate}>{date}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.title}>Bandeja de entrada</Text>
        <TouchableOpacity onPress={() => setShowCompose(true)} style={styles.composeBtn}>
          <Ionicons name="create-outline" size={22} color="#00C853" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#00C853" /></View>
      ) : messages.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="mail-outline" size={48} color="#D1D1D6" />
          <Text style={styles.emptyText}>Sin mensajes</Text>
          <Text style={styles.emptySubtext}>Aquí recibirás mensajes de administración y soporte</Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.message_id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchInbox(); }} tintColor="#00C853" />}
        />
      )}

      <Modal visible={showCompose} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nuevo mensaje</Text>
              <TouchableOpacity onPress={() => setShowCompose(false)}>
                <Ionicons name="close" size={24} color="#636366" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Asunto"
              placeholderTextColor="#8E8E93"
              value={subject}
              onChangeText={setSubject}
            />
            <TextInput
              style={[styles.input, styles.bodyInput]}
              placeholder="Escribí tu mensaje..."
              placeholderTextColor="#8E8E93"
              value={body}
              onChangeText={setBody}
              multiline
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!subject.trim() || !body.trim()) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={sending || !subject.trim() || !body.trim()}
            >
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.sendBtnText}>Enviar a soporte</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginLeft: 12 },
  composeBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(0,200,83,0.1)', justifyContent: 'center', alignItems: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#8E8E93', marginTop: 4, textAlign: 'center' },
  msgCard: { backgroundColor: '#F8F8FA', borderRadius: 14, padding: 14 },
  msgUnread: { backgroundColor: '#F0FFF4', borderLeftWidth: 3, borderLeftColor: '#00C853' },
  msgHeader: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  avatarSent: { backgroundColor: '#00C853' },
  avatarReceived: { backgroundColor: '#007AFF' },
  msgSubject: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  msgFrom: { fontSize: 12, color: '#8E8E93', marginTop: 1 },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#00C853' },
  msgBody: { fontSize: 13, color: '#636366', marginTop: 6, lineHeight: 18 },
  msgDate: { fontSize: 11, color: '#C7C7CC', marginTop: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  input: { backgroundColor: '#F2F2F7', borderRadius: 12, padding: 14, fontSize: 15, color: '#1C1C1E', marginBottom: 12 },
  bodyInput: { minHeight: 120, textAlignVertical: 'top' },
  sendBtn: { backgroundColor: '#00C853', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
