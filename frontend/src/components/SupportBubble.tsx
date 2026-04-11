import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Animated,
  PanResponder,
  Dimensions,
  ActivityIndicator,
  Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/src/services/api';
import { socketService } from '@/src/services/socket';
import { useAuthStore } from '@/src/stores/authStore';

const { width: SW, height: SH } = Dimensions.get('window');

interface SupportMsg {
  message_id: string;
  sender: 'user' | 'ai' | 'admin';
  message: string;
  admin_name?: string;
  created_at?: string;
}

export default function SupportBubble() {
  const { user } = useAuthStore();
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<SupportMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [hasUnread, setHasUnread] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Draggable bubble
  const pan = useRef(new Animated.ValueXY({ x: SW - 70, y: SH - 200 })).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5,
      onPanResponderGrant: () => {
        pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        pan.flattenOffset();
        // Snap to nearest edge
        const currentX = (pan.x as any)._value;
        const snapX = currentX < SW / 2 ? 12 : SW - 68;
        Animated.spring(pan, {
          toValue: { x: snapX, y: Math.max(60, Math.min(SH - 120, (pan.y as any)._value)) },
          useNativeDriver: false,
          friction: 7,
        }).start();
        // If barely moved, treat as tap
        if (Math.abs(g.dx) < 10 && Math.abs(g.dy) < 10) {
          openChat();
        }
      },
    })
  ).current;

  // Listen for admin/support replies
  useEffect(() => {
    if (!user) return;
    const unsub1 = socketService.on('support_reply', (data: any) => {
      const newMsg: SupportMsg = {
        message_id: `admin_${Date.now()}`,
        sender: 'admin',
        message: data.message,
        admin_name: data.sender_name,
      };
      setMessages(prev => [...prev, newMsg]);
      if (!chatOpen) {
        setHasUnread(true);
        Vibration.vibrate(200);
      }
    });
    const unsub2 = socketService.on('direct_message', (data: any) => {
      const newMsg: SupportMsg = {
        message_id: data.message_id || `dm_${Date.now()}`,
        sender: 'admin',
        message: data.message,
        admin_name: data.sender_name,
      };
      setMessages(prev => [...prev, newMsg]);
      if (!chatOpen) {
        setHasUnread(true);
        Vibration.vibrate(300);
      }
    });
    return () => { unsub1(); unsub2(); };
  }, [user, chatOpen]);

  const openChat = async () => {
    setChatOpen(true);
    setHasUnread(false);
    try {
      const res = await apiService.get('/support/history');
      setMessages(res.messages || []);
      setSessionId(res.session_id || '');
    } catch (e) { /* fresh session */ }
  };

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);

    // Optimistic
    const tempId = `user_${Date.now()}`;
    setMessages(prev => [...prev, { message_id: tempId, sender: 'user', message: text }]);
    setTimeout(() => flatListRef.current?.scrollToEnd(), 100);

    try {
      const res = await apiService.post(`/support/message?message=${encodeURIComponent(text)}${sessionId ? `&session_id=${sessionId}` : ''}`);
      if (res.session_id) setSessionId(res.session_id);
      if (res.response) {
        setMessages(prev => [...prev, {
          message_id: `ai_${Date.now()}`,
          sender: res.escalated ? 'admin' : 'ai',
          message: res.response,
        }]);
        setTimeout(() => flatListRef.current?.scrollToEnd(), 100);
      }
    } catch (e) { /* silent */ }
    setSending(false);
  };

  const renderMessage = ({ item }: { item: SupportMsg }) => {
    const isUser = item.sender === 'user';
    return (
      <View style={[st.msgRow, isUser ? st.msgRowRight : st.msgRowLeft]}>
        {!isUser && (
          <View style={[st.avatar, item.sender === 'admin' ? st.avatarAdmin : st.avatarAI]}>
            <Ionicons name={item.sender === 'admin' ? 'person' : 'sparkles'} size={14} color="#fff" />
          </View>
        )}
        <View style={[st.bubble, isUser ? st.bubbleUser : item.sender === 'admin' ? st.bubbleAdmin : st.bubbleAI]}>
          {item.sender === 'admin' && item.admin_name && (
            <Text style={st.adminName}>{item.admin_name}</Text>
          )}
          <Text style={[st.msgText, isUser && st.msgTextUser]}>{item.message}</Text>
        </View>
      </View>
    );
  };

  if (!user) return null;

  return (
    <>
      {/* Floating Bubble */}
      {!chatOpen && (
        <Animated.View style={[st.bubbleWrap, { transform: pan.getTranslateTransform() }]} {...panResponder.panHandlers}>
          <View style={st.floatingBubble}>
            <Ionicons name="headset" size={26} color="#fff" />
            {hasUnread && <View style={st.unreadDot} />}
          </View>
        </Animated.View>
      )}

      {/* Chat Modal */}
      <Modal visible={chatOpen} animationType="slide" onRequestClose={() => setChatOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={st.chatContainer}>
          {/* Header */}
          <View style={st.chatHeader}>
            <TouchableOpacity onPress={() => setChatOpen(false)} style={st.chatClose}>
              <Ionicons name="chevron-down" size={24} color="#1C1C1E" />
            </TouchableOpacity>
            <View style={st.chatHeaderCenter}>
              <View style={st.chatHeaderIcon}>
                <Ionicons name="headset" size={18} color="#fff" />
              </View>
              <View>
                <Text style={st.chatHeaderTitle}>Soporte Molí</Text>
                <Text style={st.chatHeaderSub}>Asistente + Agente humano</Text>
              </View>
            </View>
            <View style={{ width: 40 }} />
          </View>

          {/* Messages */}
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.message_id}
            renderItem={renderMessage}
            style={st.msgList}
            contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
            ListEmptyComponent={
              <View style={st.emptyChat}>
                <Ionicons name="chatbubbles-outline" size={48} color="#C7C7CC" />
                <Text style={st.emptyChatText}>¡Hola! ¿En qué podemos ayudarte?</Text>
                <Text style={st.emptyChatSub}>Nuestro asistente AI te atenderá. Si no puede resolver tu problema, un agente humano se conectará.</Text>
              </View>
            }
          />

          {/* Input */}
          <View style={st.inputBar}>
            <TextInput
              style={st.chatInput}
              value={input}
              onChangeText={setInput}
              placeholder="Escribe tu consulta..."
              placeholderTextColor="#C7C7CC"
              multiline
              maxLength={500}
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity
              style={[st.sendBtn, (!input.trim() || sending) && st.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const st = StyleSheet.create({
  // Floating bubble
  bubbleWrap: { position: 'absolute', zIndex: 9998 },
  floatingBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6BBF00',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
  },
  unreadDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FF3B30',
    borderWidth: 2,
    borderColor: '#fff',
  },
  // Chat
  chatContainer: { flex: 1, backgroundColor: '#F2F2F7' },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  chatClose: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  chatHeaderCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  chatHeaderIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#6BBF00', justifyContent: 'center', alignItems: 'center' },
  chatHeaderTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  chatHeaderSub: { fontSize: 12, color: '#8E8E93' },
  msgList: { flex: 1 },
  emptyChat: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyChatText: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginTop: 12, textAlign: 'center' },
  emptyChatSub: { fontSize: 14, color: '#8E8E93', marginTop: 8, textAlign: 'center', lineHeight: 20 },
  // Messages
  msgRow: { marginBottom: 12, flexDirection: 'row', alignItems: 'flex-end' },
  msgRowRight: { justifyContent: 'flex-end' },
  msgRowLeft: { justifyContent: 'flex-start' },
  avatar: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  avatarAI: { backgroundColor: '#007AFF' },
  avatarAdmin: { backgroundColor: '#6BBF00' },
  bubble: { maxWidth: '75%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: { backgroundColor: '#6BBF00', borderBottomRightRadius: 4 },
  bubbleAI: { backgroundColor: '#E8E8ED', borderBottomLeftRadius: 4 },
  bubbleAdmin: { backgroundColor: '#D4F5D4', borderBottomLeftRadius: 4 },
  adminName: { fontSize: 11, fontWeight: '700', color: '#6BBF00', marginBottom: 2 },
  msgText: { fontSize: 15, color: '#1C1C1E', lineHeight: 20 },
  msgTextUser: { color: '#fff' },
  // Input
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    gap: 8,
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    color: '#1C1C1E',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6BBF00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
});
