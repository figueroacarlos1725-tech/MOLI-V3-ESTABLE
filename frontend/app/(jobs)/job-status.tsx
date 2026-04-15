import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiService } from '@/src/services/api';
import { useAuthStore } from '@/src/stores/authStore';
import { socketService } from '@/src/services/socket';

const GREEN = '#00C853';

export default function JobStatusScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const params = useLocalSearchParams<{ jobId: string }>();
  const scrollRef = useRef<ScrollView>(null);

  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<any[]>([]);
  const [msgText, setMsgText] = useState('');
  const [sending, setSending] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  const loadJob = useCallback(async () => {
    try {
      const res = await apiService.get(`/jobs/detail/${params.jobId}`);
      setJob(res.job);
    } catch {}
    setLoading(false);
  }, [params.jobId]);

  const loadMessages = useCallback(async () => {
    try {
      const res = await apiService.get(`/chat/job/${params.jobId}`);
      setMessages(res.messages || []);
    } catch {}
  }, [params.jobId]);

  useEffect(() => { loadJob(); }, [loadJob]);
  useEffect(() => { if (showChat) loadMessages(); }, [showChat, loadMessages]);

  // WebSocket for new messages + job updates
  useEffect(() => {
    if (!user?.user_id) return;
    socketService.connect(user.user_id);

    const unsub = socketService.on('new_message', (msg: any) => {
      if (msg.job_id === params.jobId) {
        setMessages(prev => [...prev, msg]);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
    });

    const unsubAccepted = socketService.on('job_accepted', (msg: any) => {
      if (msg.job_id === params.jobId) loadJob();
    });

    const unsubReviewing = socketService.on('job_reviewing', (msg: any) => {
      if (msg.job_id === params.jobId) loadJob();
    });

    // Poll job status
    const iv = setInterval(loadJob, 8000);
    return () => { unsub(); unsubAccepted(); unsubReviewing(); clearInterval(iv); };
  }, [user?.user_id, params.jobId, loadJob]);

  const sendMessage = async () => {
    if (!msgText.trim()) return;
    setSending(true);
    try {
      const res = await apiService.post('/chat/job/send', {
        job_id: params.jobId,
        message: msgText.trim(),
      });
      if (res.was_filtered) {
        Alert.alert('Mensaje filtrado', 'No se permite compartir números de teléfono o emails por seguridad. Tu mensaje fue enviado con los datos ocultos.');
      }
      setMsgText('');
      loadMessages();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo enviar');
    }
    setSending(false);
  };

  const cancelJob = async () => {
    Alert.alert('Cancelar trabajo', '¿Seguro que querés cancelar este trabajo?', [
      { text: 'No', style: 'cancel' },
      { text: 'Sí, cancelar', style: 'destructive', onPress: async () => {
        setCancelling(true);
        try {
          await apiService.put(`/jobs/${params.jobId}/status`, { status: 'cancelled' });
          Alert.alert('Trabajo cancelado');
          router.back();
        } catch (e: any) {
          Alert.alert('Error', e.message || 'No se pudo cancelar');
        }
        setCancelling(false);
      }},
    ]);
  };

  if (loading) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.center}><ActivityIndicator size="large" color={GREEN} /></View>
      </View>
    );
  }

  if (!job) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Trabajo no encontrado</Text>
        </View>
      </View>
    );
  }

  const isAssigned = job.status === 'assigned' || job.status === 'in_progress';
  const isOpen = job.status === 'open' || job.status === 'reviewing';
  const isPendingCompletion = job.status === 'pending_completion';
  const isCompleted = job.status === 'completed';
  const iWasRequester = job.completed_by === user?.user_id;
  const canConfirm = isPendingCompletion && !iWasRequester;

  const statusConfig: Record<string, { color: string; icon: string; label: string }> = {
    open: { color: '#FF9500', icon: 'search', label: 'Buscando profesional...' },
    reviewing: { color: '#007AFF', icon: 'eye', label: 'Un profesional lo está revisando' },
    assigned: { color: GREEN, icon: 'checkmark-circle', label: 'Profesional asignado' },
    in_progress: { color: GREEN, icon: 'construct', label: 'En progreso' },
    pending_completion: { color: '#007AFF', icon: 'hourglass', label: iWasRequester ? 'Esperando confirmación...' : '¡Confirma que el trabajo terminó!' },
    completed: { color: '#34C759', icon: 'trophy', label: 'Completado' },
    cancelled: { color: '#FF3B30', icon: 'close-circle', label: 'Cancelado' },
    expired: { color: '#8E8E93', icon: 'time', label: 'Expirado' },
  };

  const markCompleted = async () => {
    try {
      await apiService.put(`/jobs/${params.jobId}/status`, { status: 'mark_completed' });
      loadJob();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const confirmCompleted = async () => {
    try {
      await apiService.put(`/jobs/${params.jobId}/status`, { status: 'confirm_completed' });
      loadJob();
      setShowRating(true);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const submitRating = async () => {
    setSubmittingRating(true);
    try {
      await apiService.post(`/jobs/${params.jobId}/rate`, { rating, comment: ratingComment });
      Alert.alert('¡Gracias!', 'Tu calificación fue enviada.');
      setShowRating(false);
      loadJob();
    } catch (e: any) { Alert.alert('Error', e.message); }
    setSubmittingRating(false);
  };

  const st = statusConfig[job.status] || statusConfig.open;

  return (
    <KeyboardAvoidingView style={[s.container, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{job.title}</Text>
        {isAssigned && (
          <TouchableOpacity onPress={() => setShowChat(!showChat)} style={[s.backBtn, { backgroundColor: showChat ? GREEN : '#F2F2F7' }]}>
            <Ionicons name="chatbubble" size={18} color={showChat ? '#fff' : '#1C1C1E'} />
          </TouchableOpacity>
        )}
      </View>

      {showChat && isAssigned ? (
        /* ═══ Chat view ═══ */
        <View style={{ flex: 1 }}>
          <ScrollView ref={scrollRef} style={{ flex: 1, padding: 16 }} contentContainerStyle={{ paddingBottom: 8 }}>
            {messages.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Ionicons name="chatbubbles-outline" size={40} color="#D1D1D6" />
                <Text style={{ color: '#8E8E93', marginTop: 8, fontSize: 14 }}>Enviá el primer mensaje</Text>
              </View>
            )}
            {messages.map((msg, i) => {
              const isMine = msg.sender_id === user?.user_id;
              return (
                <View key={msg.message_id || i} style={[s.msgBubble, isMine ? s.msgMine : s.msgOther]}>
                  {!isMine && <Text style={s.msgSender}>{msg.sender_name}</Text>}
                  {msg.is_filtered ? (
                    <View>
                      <Text style={[s.msgText, isMine && { color: '#fff' }, { opacity: 0.4 }]}>{msg.message}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <Ionicons name="shield" size={12} color={isMine ? 'rgba(255,255,255,0.7)' : '#FF9500'} />
                        <Text style={{ fontSize: 10, color: isMine ? 'rgba(255,255,255,0.7)' : '#FF9500' }}>Datos de contacto ocultos</Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={[s.msgText, isMine && { color: '#fff' }]}>{msg.message}</Text>
                  )}
                  <Text style={[s.msgTime, isMine && { color: 'rgba(255,255,255,0.6)' }]}>
                    {msg.created_at ? new Date(msg.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
          <View style={[s.chatInput, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            <TextInput
              style={s.chatTextInput}
              value={msgText}
              onChangeText={setMsgText}
              placeholder="Escribí un mensaje..."
              placeholderTextColor="#8E8E93"
              multiline
            />
            <TouchableOpacity style={s.sendBtn} onPress={sendMessage} disabled={sending || !msgText.trim()}>
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* ═══ Job details view ═══ */
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* Status banner */}
          <View style={[s.statusBanner, { backgroundColor: st.color + '15', borderLeftColor: st.color }]}>
            <Ionicons name={st.icon as any} size={24} color={st.color} />
            <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
          </View>

          {/* Budget */}
          <View style={s.budgetCard}>
            <Text style={s.budgetLabel}>Presupuesto</Text>
            <Text style={s.budgetValue}>${job.budget?.toLocaleString()}</Text>
          </View>

          {/* Job info */}
          <View style={s.infoCard}>
            <Text style={s.infoTitle}>Detalles del trabajo</Text>
            <View style={s.infoRow}>
              <Ionicons name="folder" size={16} color="#8E8E93" />
              <Text style={s.infoText}>{job.category}</Text>
            </View>
            <View style={s.infoRow}>
              <Ionicons name="document-text" size={16} color="#8E8E93" />
              <Text style={s.infoText}>{job.description || 'Sin descripción'}</Text>
            </View>
            {job.address ? (
              <View style={s.infoRow}>
                <Ionicons name="location" size={16} color="#8E8E93" />
                <Text style={s.infoText}>{job.address}</Text>
              </View>
            ) : null}
          </View>

          {/* Professional info (when assigned) */}
          {isAssigned && (
            <View style={s.proCard}>
              <View style={s.proHeader}>
                <View style={s.proAvatar}>
                  <Ionicons name="person" size={24} color={GREEN} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.proName}>{job.assigned_name || 'Profesional'}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Ionicons name="star" size={14} color="#FFD700" />
                    <Text style={s.proRating}>5.0</Text>
                    <Text style={s.proBadge}>Asignado</Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity style={s.chatBtn} onPress={() => setShowChat(true)}>
                <Ionicons name="chatbubble" size={18} color="#fff" />
                <Text style={s.chatBtnText}>Chatear con profesional</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Completion actions */}
          {isAssigned && !isPendingCompletion && (
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#34C759', paddingVertical: 16, borderRadius: 14, marginBottom: 8 }}
              onPress={markCompleted}
            >
              <Ionicons name="checkmark-done" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Marcar como terminado</Text>
            </TouchableOpacity>
          )}

          {/* Confirm completion (other party requested) */}
          {canConfirm && (
            <View style={{ backgroundColor: '#007AFF15', borderRadius: 16, padding: 16, marginBottom: 12 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#007AFF', textAlign: 'center', marginBottom: 12 }}>
                La otra parte marcó el trabajo como terminado
              </Text>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#34C759', paddingVertical: 16, borderRadius: 14 }}
                onPress={confirmCompleted}
              >
                <Ionicons name="checkmark-done" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Confirmar trabajo terminado</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Waiting for confirmation */}
          {isPendingCompletion && iWasRequester && (
            <View style={{ backgroundColor: '#FFF3E0', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 12 }}>
              <ActivityIndicator size="small" color="#FF9500" />
              <Text style={{ color: '#FF9500', fontWeight: '600', fontSize: 14, marginTop: 8, textAlign: 'center' }}>
                Esperando que la otra parte confirme...
              </Text>
            </View>
          )}

          {/* Rating prompt after completion */}
          {isCompleted && (
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FFD700', paddingVertical: 16, borderRadius: 14, marginBottom: 8 }}
              onPress={() => setShowRating(true)}
            >
              <Ionicons name="star" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Calificar</Text>
            </TouchableOpacity>
          )}

          {/* Cancel button */}
          {(isOpen || isAssigned) && (
            <TouchableOpacity style={s.cancelBtn} onPress={cancelJob} disabled={cancelling}>
              <Ionicons name="close-circle" size={18} color="#FF3B30" />
              <Text style={s.cancelBtnText}>{cancelling ? 'Cancelando...' : 'Cancelar trabajo'}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {/* ═══ Rating Modal ═══ */}
      {showRating && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24, zIndex: 100 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 24, padding: 28, width: '100%', alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#1C1C1E', marginBottom: 4 }}>¿Cómo fue tu experiencia?</Text>
            <Text style={{ fontSize: 14, color: '#8E8E93', marginBottom: 20 }}>Calificá de 1 a 5 estrellas</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {[1, 2, 3, 4, 5].map(star => (
                <TouchableOpacity key={star} onPress={() => setRating(star)}>
                  <Ionicons name={star <= rating ? 'star' : 'star-outline'} size={40} color={star <= rating ? '#FFD700' : '#D1D1D6'} />
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={{ width: '100%', backgroundColor: '#F2F2F7', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: '#1C1C1E', marginBottom: 16, textAlignVertical: 'top', minHeight: 60 }}
              placeholder="Comentario (opcional)"
              placeholderTextColor="#8E8E93"
              value={ratingComment}
              onChangeText={setRatingComment}
              multiline
            />
            <TouchableOpacity
              style={{ width: '100%', backgroundColor: GREEN, borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}
              onPress={submitRating}
              disabled={submittingRating}
            >
              {submittingRating ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Enviar calificación</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={{ paddingVertical: 12, marginTop: 4 }} onPress={() => setShowRating(false)}>
              <Text style={{ color: '#8E8E93', fontSize: 14 }}>Omitir</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E5E5EA', gap: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1C1C1E', flex: 1 },
  statusBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: 14, borderLeftWidth: 4, marginBottom: 12 },
  statusText: { fontSize: 15, fontWeight: '700', flex: 1 },
  budgetCard: { backgroundColor: GREEN, borderRadius: 16, padding: 20, marginBottom: 12, alignItems: 'center' },
  budgetLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  budgetValue: { fontSize: 36, fontWeight: '800', color: '#fff', marginTop: 4 },
  infoCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12 },
  infoTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E', marginBottom: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  infoText: { fontSize: 14, color: '#636366', flex: 1, lineHeight: 20 },
  proCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12 },
  proHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  proAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' },
  proName: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  proRating: { fontSize: 13, fontWeight: '600', color: '#1C1C1E' },
  proBadge: { fontSize: 11, fontWeight: '600', color: GREEN, backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginLeft: 8 },
  chatBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#007AFF', borderRadius: 12, paddingVertical: 14 },
  chatBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 14, borderWidth: 1, borderColor: '#FF3B30', marginTop: 4 },
  cancelBtnText: { color: '#FF3B30', fontSize: 15, fontWeight: '600' },
  // Chat styles
  msgBubble: { maxWidth: '80%', padding: 12, borderRadius: 16, marginBottom: 8 },
  msgMine: { alignSelf: 'flex-end', backgroundColor: GREEN, borderBottomRightRadius: 4 },
  msgOther: { alignSelf: 'flex-start', backgroundColor: '#fff', borderBottomLeftRadius: 4 },
  msgSender: { fontSize: 11, fontWeight: '600', color: '#8E8E93', marginBottom: 2 },
  msgText: { fontSize: 15, color: '#1C1C1E', lineHeight: 20 },
  msgTime: { fontSize: 10, color: '#8E8E93', marginTop: 4, alignSelf: 'flex-end' },
  chatInput: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E5EA', paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  chatTextInput: { flex: 1, backgroundColor: '#F2F2F7', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#1C1C1E', maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: GREEN, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
});
