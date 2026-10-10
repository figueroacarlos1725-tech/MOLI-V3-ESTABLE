import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Vibration, Modal, Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiService } from '@/src/services/api';
import { useAuthStore } from '@/src/stores/authStore';
import { socketService } from '@/src/services/socket';
import CampaignInterstitial from '@/src/components/CampaignInterstitial';

const GREEN = '#FF7733';

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
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [hasRated, setHasRated] = useState(false);
  const [rating, setRating] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [counterPrice, setCounterPrice] = useState('');
  const [notice, setNotice] = useState('');
  const notify = (title: string, message?: string) => {
    setNotice([title, message].filter(Boolean).join(': '));
    if (Platform.OS !== 'web') Alert.alert(title, message);
  };
  const [negotiationSeconds, setNegotiationSeconds] = useState(35);

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
    } catch (e: any) { setNotice(e.message || 'No se pudo cargar el chat'); }
  }, [params.jobId]);

  useEffect(() => { loadJob(); }, [loadJob]);
  useEffect(() => {
    if (!showChat) return;
    loadMessages();
    const interval = setInterval(loadMessages, 4000);
    return () => clearInterval(interval);
  }, [showChat, loadMessages]);
  useEffect(() => {
    if (job?.status !== 'negotiating' || !job.negotiation_deadline) return;
    const tick=()=>setNegotiationSeconds(Math.max(0,Math.ceil((new Date(job.negotiation_deadline).getTime()-Date.now())/1000)));
    tick(); const t=setInterval(tick,1000); return()=>clearInterval(t);
  }, [job?.status, job?.negotiation_deadline]);

  // WebSocket for new messages + job updates
  useEffect(() => {
    if (!user?.user_id) return;
    socketService.connect(user.user_id);

    const unsub = socketService.on('new_message', (msg: any) => {
      if (msg.job_id === params.jobId) {
        setMessages(prev => prev.some(m => m.message_id === msg.message_id) ? prev : [...prev, msg]);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
    });

    const unsubAccepted = socketService.on('job_accepted', (msg: any) => {
      if (msg.job_id === params.jobId) loadJob();
    });

    const unsubReviewing = socketService.on('job_reviewing', (msg: any) => {
      if (msg.job_id === params.jobId) loadJob();
    });
    const unsubCounter = socketService.on('job_counter_offer', (msg: any) => {
      if (msg.job_id === params.jobId) { loadJob(); setNegotiationSeconds(35); Vibration.vibrate([0, 250, 120, 250]); }
    });
    const unsubEnded = socketService.on('job_negotiation_ended', (msg: any) => { if (msg.job_id === params.jobId) loadJob(); });

    const unsubCompletion = socketService.on('job_completion_request', (msg: any) => {
      if (msg.job_id === params.jobId) {
        loadJob();
        // Alert the user that the other party marked the job as done
        Vibration.vibrate([0, 500, 200, 500]);
        notify(
          '¡Trabajo finalizado!',
          msg.requested_by === user?.user_id 
            ? 'Esperando confirmación de la otra parte...'
            : 'La otra parte marcó el trabajo como terminado. ¿Confirmás que se completó?',

        );
      }
    });

    const unsubCompleted = socketService.on('job_completed', (msg: any) => {
      if (msg.job_id === params.jobId) { 
        loadJob(); 
        Vibration.vibrate([0, 300, 150, 300, 150, 300]);
        notify('✅ Trabajo completado', '¡Ambas partes confirmaron! Calificá tu experiencia.');
        setShowRating(true); 
      }
    });

    // Poll job status
    const iv = setInterval(loadJob, 8000);
    return () => { unsub(); unsubAccepted(); unsubReviewing(); unsubCounter(); unsubEnded(); unsubCompletion(); unsubCompleted(); clearInterval(iv); };
  }, [user?.user_id, params.jobId, loadJob]);

  const sendMessage = async () => {
    if (!msgText.trim() || sending) return;
    setNotice('');
    setSending(true);
    try {
      const res = await apiService.post('/chat/job/send', {
        job_id: params.jobId,
        message: msgText.trim(),
      });
      if (res.was_filtered) {
        notify('Mensaje filtrado', 'No se permite compartir números de teléfono o emails por seguridad. Tu mensaje fue enviado con los datos ocultos.');
      }
      setMsgText('');
      loadMessages();
    } catch (e: any) {
      notify('Error', e.message || 'No se pudo enviar');
    }
    setSending(false);
  };

  const cancelJob = () => setShowCancelConfirm(true);

  const confirmCancelJob = async () => {
    const jid = job?.job_id || params.jobId;
    if (!jid) { notify('Error', 'No se encontró el ID del trabajo'); return; }
    setCancelling(true);
    try {
      await apiService.put(`/jobs/${jid}/status`, { status: 'cancelled' });
      setShowCancelConfirm(false);
      router.replace('/modules');
    } catch (e: any) {
      notify('Error', e.message || 'No se pudo cancelar');
    } finally { setCancelling(false); }
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
  const isClientCanceller = user?.user_id === job.client_id;
  const acceptedAtMs = job.assigned_at ? new Date(job.assigned_at).getTime() : 0;
  const professionalFreeCancel = isAssigned && !isClientCanceller && acceptedAtMs > 0 && Date.now() - acceptedAtMs <= 120000;
  const assignedCancelCopy = isClientCanceller
    ? 'El profesional ya aceptó. Al cancelar se aplicará una multa del 10% del valor del trabajo.'
    : professionalFreeCancel
      ? 'Estás dentro de los primeros 2 minutos desde que aceptaste. Podés cancelar sin multa.'
      : 'Pasaron más de 2 minutos desde que aceptaste. Al cancelar se aplicará una multa del 10% del valor del trabajo.';
  const isOpen = job.status === 'open' || job.status === 'reviewing';
  const isNegotiating = job.status === 'negotiating';
  const myNegotiationTurn = isNegotiating && ((job.negotiation_turn === 'client' && user?.user_id === job.client_id) || (job.negotiation_turn === 'professional' && user?.user_id === job.reviewing_by));
  const isPendingCompletion = job.status === 'pending_completion';
  const isCompleted = job.status === 'completed';
  const iWasRequester = job.completed_by === user?.user_id;
  const canConfirm = isPendingCompletion && !iWasRequester;

  const statusConfig: Record<string, { color: string; icon: string; label: string }> = {
    open: { color: '#FF9500', icon: 'search', label: 'Buscando profesional...' },
    reviewing: { color: '#007AFF', icon: 'eye', label: 'Un profesional lo está revisando' },
    negotiating: { color: '#FF7733', icon: 'swap-horizontal', label: 'Negociación en curso' },
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
    } catch (e: any) { notify('Error', e.message); }
  };

  const confirmCompleted = async () => {
    try {
      await apiService.put(`/jobs/${params.jobId}/status`, { status: 'confirm_completed' });
      loadJob();
      setShowRating(true);
    } catch (e: any) { notify('Error', e.message); }
  };

  const submitRating = async () => {
    setSubmittingRating(true);
    try {
      await apiService.post(`/jobs/${params.jobId}/rate`, { rating, comment: ratingComment });
      notify('¡Gracias!', 'Tu calificación fue enviada.');
      setShowRating(false);
      setHasRated(true);
      loadJob();
    } catch (e: any) { notify('Error', e.message); }
    setSubmittingRating(false);
  };

  const st = statusConfig[job.status] || statusConfig.open;

  const respondNegotiation=async(action:'accept'|'counter'|'decline')=>{
    try{await apiService.post(`/jobs/${params.jobId}/negotiation/respond`,{action,price:action==='counter'?Number(counterPrice):undefined});setCounterPrice('');loadJob();}
    catch(e:any){notify('No se pudo responder',e.message);loadJob();}
  };

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

      {!!notice && <Text accessibilityRole="alert" style={{ color: '#B42318', padding: 12 }}>{notice}</Text>}
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
          {isOpen && <TouchableOpacity style={s.cancelSearchBtn} onPress={cancelJob} disabled={cancelling}><Ionicons name="stop-circle-outline" size={19} color="#FF3B30"/><Text style={s.cancelSearchText}>Cancelar búsqueda</Text></TouchableOpacity>}

          {isNegotiating && <View style={s.negotiationCard}>
            <View style={s.negotiationTop}><View><Text style={s.negotiationEyebrow}>CONTRAPROPUESTA · RONDA {job.negotiation_round || 1} DE 3</Text><Text style={s.negotiationPrice}>${Number(job.negotiation_price||0).toLocaleString('es-AR')}</Text></View><View style={s.timerPill}><Ionicons name="timer" size={16} color="#FF5A1F"/><Text style={s.timerValue}>{negotiationSeconds}s</Text></View></View>
            <Text style={s.negotiationCopy}>{myNegotiationTurn?'Es tu turno: aceptá o enviá una contraoferta.':'Esperando la respuesta de la otra persona…'}</Text>
            {myNegotiationTurn && <><View style={s.clientCounterRow}><Text style={s.clientCounterCurrency}>$</Text><TextInput style={s.clientCounterInput} value={counterPrice} onChangeText={t=>setCounterPrice(t.replace(/[^0-9]/g,''))} keyboardType="numeric" placeholder="Tu contraoferta"/></View><View style={s.negotiationActions}><TouchableOpacity style={s.negDecline} onPress={()=>respondNegotiation('decline')}><Text style={s.negDeclineText}>No aceptar</Text></TouchableOpacity><TouchableOpacity style={s.negCounter} disabled={!counterPrice} onPress={()=>respondNegotiation('counter')}><Text style={s.negCounterText}>Contraofertar</Text></TouchableOpacity><TouchableOpacity style={s.negAccept} onPress={()=>respondNegotiation('accept')}><Text style={s.negAcceptText}>Aceptar</Text></TouchableOpacity></View></>}
          </View>}

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

          {Array.isArray(job.attachments) && job.attachments.length > 0 && (
            <View style={s.infoCard}>
              <Text style={s.infoTitle}>Adjuntos de la solicitud</Text>
              {job.attachments.map((attachment: any, index: number) => {
                const uri = typeof attachment === 'string' ? attachment : attachment?.uri;
                return typeof uri === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(uri) && uri.length <= 3 * 1024 * 1024
                  ? <Image key={index} source={{ uri }} accessibilityLabel={`Adjunto ${index + 1}`} resizeMode="contain" style={{ width: '100%', height: 200, marginVertical: 8 }} />
                  : <Text key={index} style={s.infoText}>{attachment?.name || `Documento ${index + 1}`} · vista previa no disponible</Text>;
              })}
            </View>
          )}

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
                    <Text style={s.proRating}>{typeof job.assigned_rating === 'number' ? job.assigned_rating.toFixed(1) : 'Sin calificaciones'}</Text>
                    <Text style={s.proBadge}>Asignado</Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity style={s.chatBtn} onPress={() => setShowChat(true)}>
                <Ionicons name="chatbubble" size={18} color="#fff" />
                <Text style={s.chatBtnText}>{job.client_id === user?.user_id ? 'Chatear con profesional' : 'Chatear con cliente'}</Text>
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

          {/* Rating prompt / Return button after completion */}
          {isCompleted && !hasRated && (
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FFD700', paddingVertical: 16, borderRadius: 14, marginBottom: 8 }}
              onPress={() => setShowRating(true)}
            >
              <Ionicons name="star" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Calificar</Text>
            </TouchableOpacity>
          )}
          {isCompleted && hasRated && (
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, paddingVertical: 16, borderRadius: 14, marginBottom: 8 }}
              onPress={() => router.replace('/modules')}
            >
              <Ionicons name="arrow-back" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Volver al inicio</Text>
            </TouchableOpacity>
          )}

          {/* Cancel button */}
          {isAssigned && (
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
      <CampaignInterstitial
        enabled={job.status === 'in_progress'}
        trigger={job.category === 'tramites' ? 'tramite_started' : 'job_started'}
        surface={job.category === 'tramites' ? 'tramites' : 'jobs'}
        entityType="job"
        entityId={job.job_id || params.jobId}
      />
      <Modal visible={showCancelConfirm} transparent animationType="fade" onRequestClose={()=>setShowCancelConfirm(false)}>
        <View style={s.confirmOverlay}><View style={s.confirmCard}><View style={s.confirmIcon}><Ionicons name="close-circle" size={34} color="#FF3B30"/></View><Text style={s.confirmTitle}>{isAssigned?'Cancelar servicio asignado':'Cancelar solicitud'}</Text><Text style={s.confirmCopy}>{isAssigned?assignedCancelCopy:'La búsqueda se detendrá y la solicitud desaparecerá del inicio. Esta acción no se puede deshacer.'}</Text><Text style={s.confirmWarning}>Cada cancelación con multa suma una falta. En la tercera, la cuenta queda bloqueada.</Text><TouchableOpacity style={s.confirmDanger} disabled={cancelling} onPress={confirmCancelJob}>{cancelling?<ActivityIndicator color="#fff"/>:<Text style={s.confirmDangerText}>{isAssigned&&!professionalFreeCancel?'Cancelar y aceptar multa':'Sí, cancelar'}</Text>}</TouchableOpacity><TouchableOpacity style={s.confirmKeep} disabled={cancelling} onPress={()=>setShowCancelConfirm(false)}><Text style={s.confirmKeepText}>Volver</Text></TouchableOpacity></View></View>
      </Modal>
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
  negotiationCard:{backgroundColor:'#202124',borderRadius:24,padding:17,marginBottom:13,shadowColor:'#6D2C0D',shadowOffset:{width:0,height:8},shadowOpacity:.25,shadowRadius:14,elevation:8},negotiationTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},negotiationEyebrow:{fontSize:9,fontWeight:'900',letterSpacing:.8,color:'#FF986D'},negotiationPrice:{fontSize:31,fontWeight:'900',color:'#fff',marginTop:3},timerPill:{flexDirection:'row',alignItems:'center',gap:5,backgroundColor:'#FFF0E8',paddingHorizontal:11,paddingVertical:8,borderRadius:18},timerValue:{fontSize:15,fontWeight:'900',color:'#FF5A1F'},negotiationCopy:{fontSize:12,color:'#D6D0CC',marginTop:9},clientCounterRow:{flexDirection:'row',alignItems:'center',marginTop:12},clientCounterCurrency:{color:'#fff',fontSize:20,fontWeight:'900',marginRight:7},clientCounterInput:{flex:1,backgroundColor:'#fff',borderRadius:13,paddingHorizontal:12,paddingVertical:10,fontWeight:'800'},negotiationActions:{flexDirection:'row',gap:6,marginTop:10},negDecline:{flex:1,paddingVertical:12,alignItems:'center'},negDeclineText:{color:'#FF8C7C',fontSize:11,fontWeight:'800'},negCounter:{flex:1.25,paddingVertical:12,alignItems:'center',borderWidth:1,borderColor:'#FF7733',borderRadius:13},negCounterText:{color:'#FF986D',fontSize:11,fontWeight:'800'},negAccept:{flex:1,paddingVertical:12,alignItems:'center',backgroundColor:'#FF5A1F',borderRadius:13},negAcceptText:{color:'#fff',fontSize:11,fontWeight:'900'},
  budgetLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  budgetValue: { fontSize: 36, fontWeight: '800', color: '#fff', marginTop: 4 },
  infoCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12 },
  infoTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E', marginBottom: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  infoText: { fontSize: 14, color: '#636366', flex: 1, lineHeight: 20 },
  proCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12 },
  proHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  proAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFF0EC', justifyContent: 'center', alignItems: 'center' },
  proName: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  proRating: { fontSize: 13, fontWeight: '600', color: '#1C1C1E' },
  proBadge: { fontSize: 11, fontWeight: '600', color: GREEN, backgroundColor: '#FFF0EC', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginLeft: 8 },
  chatBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#007AFF', borderRadius: 12, paddingVertical: 14 },
  chatBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 14, borderWidth: 1, borderColor: '#FF3B30', marginTop: 4 },
  cancelBtnText: { color: '#FF3B30', fontSize: 15, fontWeight: '600' },
  cancelSearchBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,backgroundColor:'#fff',borderRadius:14,paddingVertical:13,borderWidth:1,borderColor:'#FFD0CD',marginBottom:12},cancelSearchText:{color:'#FF3B30',fontSize:13,fontWeight:'900'},
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
  confirmOverlay:{flex:1,backgroundColor:'rgba(32,33,36,.52)',alignItems:'center',justifyContent:'center',padding:22},confirmCard:{width:'100%',maxWidth:440,backgroundColor:'#FFF8F2',borderRadius:28,padding:22,alignItems:'center',borderWidth:1,borderColor:'#F0DFD2',shadowColor:'#000',shadowOffset:{width:0,height:10},shadowOpacity:.22,shadowRadius:20,elevation:20},confirmIcon:{width:68,height:68,borderRadius:23,backgroundColor:'#FFF0EF',alignItems:'center',justifyContent:'center'},confirmTitle:{fontSize:21,fontWeight:'900',color:'#202124',marginTop:14},confirmCopy:{fontSize:13,lineHeight:19,color:'#74777C',textAlign:'center',marginTop:7,marginBottom:12},confirmWarning:{fontSize:12,lineHeight:18,color:'#9A6700',textAlign:'center',backgroundColor:'#FFF3CD',borderRadius:12,padding:10,marginBottom:16},confirmDanger:{width:'100%',minHeight:52,borderRadius:17,backgroundColor:'#FF3B30',alignItems:'center',justifyContent:'center'},confirmDangerText:{color:'#fff',fontSize:14,fontWeight:'900'},confirmKeep:{paddingVertical:14},confirmKeepText:{fontSize:13,fontWeight:'800',color:'#5E6166'},
});
