import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/src/stores/authStore';
import { apiService } from '@/src/services/api';
import { socketService } from '@/src/services/socket';

interface ChatMessage {
  message_id: string;
  ride_id?: string;
  job_id?: string;
  sender_id: string;
  sender_name: string;
  receiver_id: string;
  message: string;
  is_ai: boolean;
  created_at: string;
}

export default function RideChatScreen() {
  const { rideId, jobId, otherName } = useLocalSearchParams<{ rideId: string; jobId: string; otherName: string }>();
  const historyPath = jobId ? `/chat/job/${encodeURIComponent(jobId)}` : `/chat/ride/${encodeURIComponent(rideId || '')}`;
  const sendToService = (message: string) => jobId
    ? apiService.post('/chat/job/send', { job_id: jobId, message })
    : apiService.post(`/chat/send?ride_id=${encodeURIComponent(rideId || '')}&message=${encodeURIComponent(message)}`);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [showQuick, setShowQuick] = useState(true);
  const [notice, setNotice] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const handleQuickSend = async (msg: string) => {
    setShowQuick(false);
    if ((!jobId && !rideId) || isSending) return;
    setNotice('');
    setIsSending(true);
    
    const tempMsg: ChatMessage = {
      message_id: `temp_${Date.now()}`,
      ride_id: rideId,
      job_id: jobId,
      sender_id: user?.user_id || '',
      sender_name: user?.name || 'Yo',
      receiver_id: '',
      message: msg,
      is_ai: false,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMsg]);
    setTimeout(() => flatListRef.current?.scrollToEnd(), 100);
    
    try {
      const response = await sendToService(msg);
      if (response.message) {
        setMessages(prev => prev.map(m => 
          m.message_id === tempMsg.message_id ? { ...response.message } : m
        ));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo enviar. Intentá nuevamente.');
      setMessages(prev => prev.filter(m => m.message_id !== tempMsg.message_id));
    } finally {
      setIsSending(false);
    }
  };

  const QUICK_MESSAGES = [
    'Estoy en camino',
    'Ya llegué',
    'Esperame un momento',
    'Estoy afuera',
    '5 minutos más',
    'Ok, gracias',
    '¿Dónde estás?',
    'Voy para allá',
  ];

  useEffect(() => {
    loadMessages();
    
    // Listen for new messages via WebSocket
    const unsubscribe = socketService.on('new_message', (data: any) => {
      if (jobId ? data.job_id === jobId : Boolean(rideId) && data.ride_id === rideId) {
        // Avoid duplicates
        setMessages(prev => {
          if (prev.some(m => m.message_id === data.message_id)) return prev;
          return [...prev, data];
        });
        setTimeout(() => flatListRef.current?.scrollToEnd(), 100);
      }
    });

    // Poll for new messages every 4s (WebSocket fallback)
    const pollInterval = setInterval(async () => {
      try {
        const response = await apiService.get(historyPath);
        if (response.messages) {
          setMessages(prev => {
            const newMsgs = response.messages.filter(
              (m: ChatMessage) => !prev.some(p => p.message_id === m.message_id) && !m.message_id.startsWith('temp_')
            );
            if (newMsgs.length > 0) {
              const merged = [...prev.filter(p => !p.message_id.startsWith('temp_')), ...newMsgs];
              merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
              // Dedupe
              const seen = new Set<string>();
              return merged.filter(m => { if (seen.has(m.message_id)) return false; seen.add(m.message_id); return true; });
            }
            return prev;
          });
        }
      } catch (e) { /* ignore */ }
    }, 4000);

    return () => { unsubscribe(); clearInterval(pollInterval); };
  }, [rideId, jobId]);

  const loadMessages = async () => {
    try {
      const response = await apiService.get(historyPath);
      setMessages(response.messages || []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo cargar el chat.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || isSending) return;

    const msgText = newMessage.trim();
    if ((!jobId && !rideId) || isSending) return;
    setNotice('');
    setIsSending(true);
    setNewMessage('');
    
    // Optimistic: add message locally immediately
    const tempMsg: ChatMessage = {
      message_id: `temp_${Date.now()}`,
      ride_id: rideId,
      job_id: jobId,
      sender_id: user?.user_id || '',
      sender_name: user?.name || 'Yo',
      receiver_id: '',
      message: msgText,
      is_ai: false,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMsg]);
    setTimeout(() => flatListRef.current?.scrollToEnd(), 100);
    
    try {
      const response = await sendToService(msgText);
      // Replace temp message with real one
      if (response.message) {
        setMessages(prev => prev.map(m => 
          m.message_id === tempMsg.message_id ? { ...response.message } : m
        ));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo enviar. Intentá nuevamente.');
      // Remove temp message on error
      setMessages(prev => prev.filter(m => m.message_id !== tempMsg.message_id));
      setNewMessage(msgText); // Restore message text
    } finally {
      setIsSending(false);
    }
  };

  const renderMessage = useCallback(({ item }: { item: ChatMessage }) => {
    const isMe = item.sender_id === user?.user_id;
    return (
      <View style={[styles.messageRow, isMe ? styles.myMessageRow : styles.otherMessageRow]}>
        <View style={[styles.messageBubble, isMe ? styles.myBubble : styles.otherBubble]}>
          {!isMe && (
            <Text style={styles.senderName}>{item.sender_name}</Text>
          )}
          <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.otherMessageText]}>
            {item.message}
          </Text>
          <Text style={[styles.messageTime, isMe ? styles.myTime : styles.otherTime]}>
            {new Date(item.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  }, [user]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={styles.headerAvatar}>
            <Ionicons name="person" size={20} color="#FF7733" />
          </View>
          <View>
            <Text style={styles.headerName}>{otherName || 'Chat'}</Text>
            <View style={styles.secureStatus}><Ionicons name="shield-checkmark" size={11} color="#FF7733" /><Text style={styles.headerStatus}>Conversación protegida</Text></View>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF7733" />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.message_id}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="chatbubble-outline" size={48} color="#E5E5EA" />
                <Text style={styles.emptyText}>Sin mensajes aun</Text>
                <Text style={styles.emptySubtext}>Envia un mensaje para iniciar la conversacion</Text>
              </View>
            }
          />
        )}

        {/* Quick messages */}
        {showQuick && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickScroll} contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}>
            {QUICK_MESSAGES.map((msg, i) => (
              <TouchableOpacity key={i} style={styles.quickChip} onPress={() => handleQuickSend(msg)}>
                <Text style={styles.quickText}>{msg}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {!!notice && <Text accessibilityRole="alert" style={{ color: '#B42318', padding: 12 }}>{notice}</Text>}
        <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            style={styles.input}
            value={newMessage}
            onChangeText={(t) => { setNewMessage(t); if (t.length === 0) setShowQuick(true); }}
            placeholder="Escribe un mensaje..."
            placeholderTextColor="#8E8E93"
            multiline
            maxLength={500}
            onFocus={() => setShowQuick(true)}
          />
          <TouchableOpacity
            style={[styles.sendButton, newMessage.trim() ? styles.sendButtonActive : {}]}
            accessibilityRole="button"
            accessibilityLabel="Enviar mensaje"
            onPress={handleSend}
            disabled={!newMessage.trim() || isSending}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={20} color={newMessage.trim() ? '#fff' : '#C7C7CC'} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', padding: 4, marginRight: 8 },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  headerAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FFF0EC', justifyContent: 'center', alignItems: 'center',
    marginRight: 12,
  },
  headerName: { fontSize: 16, fontWeight: '600', color: '#1C1C1E' },
  headerStatus: { fontSize: 12, color: '#FF7733', marginTop: 2 },
  secureStatus: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  callButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#FFF0EC', justifyContent: 'center', alignItems: 'center',
  },
  chatContainer: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  messagesList: { padding: 16, paddingBottom: 8 },
  messageRow: { marginBottom: 8 },
  myMessageRow: { alignItems: 'flex-end' },
  otherMessageRow: { alignItems: 'flex-start' },
  messageBubble: { maxWidth: '80%', padding: 12, borderRadius: 16 },
  myBubble: { backgroundColor: '#FF7733', borderBottomRightRadius: 4 },
  otherBubble: { backgroundColor: '#fff', borderBottomLeftRadius: 4 },
  senderName: { fontSize: 12, fontWeight: '600', color: '#FF7733', marginBottom: 4 },
  messageText: { fontSize: 15, lineHeight: 20 },
  myMessageText: { color: '#fff' },
  otherMessageText: { color: '#1C1C1E' },
  messageTime: { fontSize: 11, marginTop: 4 },
  myTime: { color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  otherTime: { color: '#8E8E93' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#1C1C1E', marginTop: 12 },
  emptySubtext: { fontSize: 14, color: '#8E8E93', marginTop: 4, textAlign: 'center' },
  inputContainer: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 12,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E5EA',
  },
  input: {
    flex: 1, backgroundColor: '#F2F2F7', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, maxHeight: 100, color: '#1C1C1E',
  },
  sendButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#E5E5EA', justifyContent: 'center', alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonActive: { backgroundColor: '#FF7733' },
  quickScroll: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E5EA', paddingVertical: 8, maxHeight: 44 },
  quickChip: { backgroundColor: '#FFF0EC', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: '#FF7733', alignSelf: 'center', height: 34, justifyContent: 'center' },
  quickText: { fontSize: 13, color: '#FF7733', fontWeight: '600' },
});
