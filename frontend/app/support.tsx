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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import { apiService } from '@/src/services/api';
import { socketService } from '@/src/services/socket';

interface SupportMessage {
  message_id: string;
  session_id: string;
  sender_id: string;
  sender_name: string;
  message: string;
  is_ai: boolean;
  is_dispatcher: boolean;
  created_at: string;
}

export default function SupportChatScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadHistory();
    
    const unsub1 = socketService.on('support_message', (data: any) => {
      setMessages(prev => [...prev, data]);
      setTimeout(() => flatListRef.current?.scrollToEnd(), 100);
    });
    const unsub2 = socketService.on('dispatcher_joined', (data: any) => {
      setMessages(prev => [...prev, data]);
      setTimeout(() => flatListRef.current?.scrollToEnd(), 100);
    });

    return () => { unsub1(); unsub2(); };
  }, []);

  const loadHistory = async () => {
    try {
      const response = await apiService.get('/support/history');
      if (response.sessions && response.sessions.length > 0) {
        const latestSession = response.sessions[0];
        if (latestSession.status !== 'resolved') {
          setSessionId(latestSession.session_id);
          const historyResponse = await apiService.get(`/support/history?session_id=${latestSession.session_id}`);
          setMessages(historyResponse.messages || []);
        }
      }
    } catch (error) {
      console.error('Error cargando historial:', error);
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || isSending) return;

    const userMsg: SupportMessage = {
      message_id: `temp_${Date.now()}`,
      session_id: sessionId || '',
      sender_id: user?.user_id || '',
      sender_name: user?.name || 'Usuario',
      message: newMessage.trim(),
      is_ai: false,
      is_dispatcher: false,
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg]);
    const msgText = newMessage.trim();
    setNewMessage('');
    setIsSending(true);
    setIsAiTyping(true);
    setTimeout(() => flatListRef.current?.scrollToEnd(), 100);

    try {
      const params = new URLSearchParams({ message: msgText });
      if (sessionId) params.append('session_id', sessionId);

      const response = await apiService.post(`/support/chat?${params.toString()}`);

      if (response.session_id && !sessionId) {
        setSessionId(response.session_id);
      }

      if (response.response) {
        const aiMsg: SupportMessage = {
          message_id: `ai_${Date.now()}`,
          session_id: response.session_id || sessionId || '',
          sender_id: 'ai_assistant',
          sender_name: 'Moli Asistente',
          message: typeof response.response === 'string' ? response.response : response.response.message || '',
          is_ai: true,
          is_dispatcher: false,
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, aiMsg]);
        setTimeout(() => flatListRef.current?.scrollToEnd(), 100);
      }
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      const errorMsg: SupportMessage = {
        message_id: `err_${Date.now()}`,
        session_id: sessionId || '',
        sender_id: 'system',
        sender_name: 'Sistema',
        message: 'Error de conexion. Intenta de nuevo.',
        is_ai: false,
        is_dispatcher: false,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsSending(false);
      setIsAiTyping(false);
    }
  };

  const renderMessage = useCallback(({ item }: { item: SupportMessage }) => {
    const isMe = item.sender_id === user?.user_id;
    const isSystem = item.sender_id === 'system';

    if (isSystem) {
      return (
        <View style={styles.systemMessage}>
          <Text style={styles.systemMessageText}>{item.message}</Text>
        </View>
      );
    }

    return (
      <View style={[styles.messageRow, isMe ? styles.myMessageRow : styles.otherMessageRow]}>
        {!isMe && (
          <View style={[styles.avatar, item.is_ai ? styles.aiAvatar : styles.dispatcherAvatar]}>
            <Ionicons
              name={item.is_ai ? 'sparkles' : 'headset'}
              size={16}
              color={item.is_ai ? '#8E44AD' : '#A855F7'}
            />
          </View>
        )}
        <View style={[styles.messageBubble, isMe ? styles.myBubble : (item.is_ai ? styles.aiBubble : styles.otherBubble)]}>
          {!isMe && (
            <Text style={styles.senderName}>
              {item.is_ai ? 'Moli Asistente' : (item.is_dispatcher ? item.sender_name : item.sender_name)}
            </Text>
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
            <Ionicons name="sparkles" size={20} color="#8E44AD" />
          </View>
          <View>
            <Text style={styles.headerName}>Soporte Moli</Text>
            <Text style={styles.headerStatus}>IA + Soporte humano</Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.message_id}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          ListHeaderComponent={
            messages.length === 0 ? (
              <View style={styles.welcomeContainer}>
                <View style={styles.welcomeIcon}>
                  <Ionicons name="sparkles" size={40} color="#8E44AD" />
                </View>
                <Text style={styles.welcomeTitle}>Hola! Soy Moli Asistente</Text>
                <Text style={styles.welcomeText}>
                  Estoy aqui para ayudarte con cualquier pregunta sobre tus viajes, pagos, o cualquier problema que tengas.
                </Text>
                <View style={styles.quickActions}>
                  {['Problema con un viaje', 'Pregunta sobre pagos', 'Reportar un problema'].map((q, i) => (
                    <TouchableOpacity
                      key={i}
                      style={styles.quickAction}
                      onPress={() => setNewMessage(q)}
                    >
                      <Text style={styles.quickActionText}>{q}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null
          }
        />

        {isAiTyping && (
          <View style={styles.typingIndicator}>
            <View style={styles.typingDots}>
              <View style={[styles.dot, styles.dot1]} />
              <View style={[styles.dot, styles.dot2]} />
              <View style={[styles.dot, styles.dot3]} />
            </View>
            <Text style={styles.typingText}>Moli Asistente esta escribiendo...</Text>
          </View>
        )}

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder="Escribe tu consulta..."
            placeholderTextColor="#8E8E93"
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendButton, newMessage.trim() ? styles.sendButtonActive : {}]}
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
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#E5E5EA',
  },
  backButton: { padding: 4, marginRight: 8 },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  headerAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F3E5F5', justifyContent: 'center', alignItems: 'center',
    marginRight: 12,
  },
  headerName: { fontSize: 16, fontWeight: '600', color: '#1C1C1E' },
  headerStatus: { fontSize: 12, color: '#8E44AD', marginTop: 2 },
  chatContainer: { flex: 1 },
  messagesList: { padding: 16, paddingBottom: 8 },
  welcomeContainer: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  welcomeIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#F3E5F5', justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  welcomeTitle: { fontSize: 20, fontWeight: 'bold', color: '#1C1C1E', marginBottom: 8 },
  welcomeText: { fontSize: 15, color: '#8E8E93', textAlign: 'center', lineHeight: 22 },
  quickActions: { marginTop: 24, width: '100%', gap: 8 },
  quickAction: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#E5E5EA',
  },
  quickActionText: { fontSize: 14, color: '#8E44AD', textAlign: 'center', fontWeight: '500' },
  messageRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  myMessageRow: { justifyContent: 'flex-end' },
  otherMessageRow: { justifyContent: 'flex-start' },
  avatar: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  aiAvatar: { backgroundColor: '#F3E5F5' },
  dispatcherAvatar: { backgroundColor: '#E8F5E9' },
  messageBubble: { maxWidth: '75%', padding: 12, borderRadius: 16 },
  myBubble: { backgroundColor: '#A855F7', borderBottomRightRadius: 4 },
  aiBubble: { backgroundColor: '#fff', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#E5E5EA' },
  otherBubble: { backgroundColor: '#fff', borderBottomLeftRadius: 4 },
  senderName: { fontSize: 12, fontWeight: '600', color: '#8E44AD', marginBottom: 4 },
  messageText: { fontSize: 15, lineHeight: 21 },
  myMessageText: { color: '#fff' },
  otherMessageText: { color: '#1C1C1E' },
  messageTime: { fontSize: 11, marginTop: 4 },
  myTime: { color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  otherTime: { color: '#8E8E93' },
  systemMessage: { alignItems: 'center', marginVertical: 12 },
  systemMessageText: {
    fontSize: 13, color: '#8E8E93', backgroundColor: '#E5E5EA',
    paddingHorizontal: 16, paddingVertical: 6, borderRadius: 12,
  },
  typingIndicator: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 24, paddingVertical: 8,
  },
  typingDots: { flexDirection: 'row', gap: 4, marginRight: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#8E44AD', opacity: 0.4 },
  dot1: { opacity: 0.8 },
  dot2: { opacity: 0.5 },
  dot3: { opacity: 0.3 },
  typingText: { fontSize: 13, color: '#8E8E93', fontStyle: 'italic' },
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
  sendButtonActive: { backgroundColor: '#8E44AD' },
});
