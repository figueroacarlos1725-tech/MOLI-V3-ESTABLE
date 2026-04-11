import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
  Modal,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/src/services/api';
import { socketService } from '@/src/services/socket';
import { useAuthStore } from '@/src/stores/authStore';

interface SupportSession {
  session_id: string;
  user_id: string;
  user_name?: string;
  escalated: boolean;
  last_message?: string;
  created_at?: string;
}

interface SupportMsg {
  message_id: string;
  sender: string;
  message: string;
  admin_name?: string;
  created_at?: string;
}

interface UserItem {
  user_id: string;
  name: string;
  email: string;
  user_type: string;
  phone?: string;
}

export default function AdminSupportScreen() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<'tickets' | 'users'>('tickets');
  const [tickets, setTickets] = useState<SupportSession[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Chat modal
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSession, setChatSession] = useState('');
  const [chatUserId, setChatUserId] = useState('');
  const [chatUserName, setChatUserName] = useState('');
  const [chatMessages, setChatMessages] = useState<SupportMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [isDirect, setIsDirect] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [ticketsRes, usersRes] = await Promise.all([
        apiService.get('/admin/support/sessions').catch(() => ({ sessions: [] })),
        apiService.get('/admin/users?limit=100').catch(() => ({ users: [] })),
      ]);
      setTickets(ticketsRes?.sessions || []);
      setUsers(usersRes?.users || []);
    } catch (e) {
      console.error('Error loading support data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Listen for real-time support events
  useEffect(() => {
    if (!user) return;
    const unsub1 = socketService.on('support_escalation', (data: any) => {
      Vibration.vibrate([0, 500, 200, 500, 200, 500]);
      const newTicket: SupportSession = {
        session_id: data.session_id,
        user_id: data.user_id,
        user_name: data.user_name,
        escalated: true,
        last_message: data.message,
      };
      setTickets(prev => [newTicket, ...prev.filter(t => t.session_id !== data.session_id)]);
    });
    const unsub2 = socketService.on('support_message', (data: any) => {
      Vibration.vibrate([0, 300, 200, 300]);
      if (chatOpen && chatSession === data.session_id) {
        setChatMessages(prev => [...prev, {
          message_id: `usr_${Date.now()}`,
          sender: 'user',
          message: data.message,
        }]);
      }
    });
    return () => { unsub1(); unsub2(); };
  }, [user, chatOpen, chatSession]);

  const openTicketChat = async (session: SupportSession) => {
    setIsDirect(false);
    setChatSession(session.session_id);
    setChatUserId(session.user_id);
    setChatUserName(session.user_name || session.user_id);
    setChatOpen(true);
    try {
      const res = await apiService.get(`/support/history?session_id=${session.session_id}`);
      setChatMessages(res?.messages || []);
    } catch (e) { setChatMessages([]); }
  };

  const openDirectChat = (u: UserItem) => {
    setIsDirect(true);
    setChatSession('');
    setChatUserId(u.user_id);
    setChatUserName(u.name || u.email);
    setChatMessages([]);
    setChatOpen(true);
  };

  const handleSendReply = async () => {
    if (!chatInput.trim() || sending) return;
    const text = chatInput.trim();
    setChatInput('');
    setSending(true);
    setChatMessages(prev => [...prev, {
      message_id: `admin_${Date.now()}`,
      sender: 'admin',
      admin_name: user?.name || 'Admin',
      message: text,
    }]);
    try {
      if (isDirect) {
        await apiService.post(`/admin/direct-message?target_user_id=${chatUserId}&message=${encodeURIComponent(text)}`);
      } else {
        await apiService.post(`/admin/support/reply?session_id=${chatSession}&message=${encodeURIComponent(text)}`);
      }
    } catch (e) { console.error('Error sending:', e); }
    setSending(false);
  };

  const renderTicket = ({ item }: { item: SupportSession }) => (
    <TouchableOpacity style={st.ticketCard} onPress={() => openTicketChat(item)}>
      <View style={[st.ticketDot, item.escalated && st.ticketDotEscalated]} />
      <View style={st.ticketInfo}>
        <Text style={st.ticketName}>{item.user_name || item.user_id?.substring(0, 12)}</Text>
        <Text style={st.ticketMsg} numberOfLines={1}>{item.last_message || 'Ticket de soporte'}</Text>
      </View>
      {item.escalated && (
        <View style={st.escalatedBadge}><Text style={st.escalatedText}>Escalado</Text></View>
      )}
      <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
    </TouchableOpacity>
  );

  const renderUser = ({ item }: { item: UserItem }) => (
    <TouchableOpacity style={st.userCard} onPress={() => openDirectChat(item)}>
      <View style={[st.userIcon, item.user_type === 'driver' ? st.userIconDriver : st.userIconRider]}>
        <Ionicons name={item.user_type === 'driver' ? 'car' : 'person'} size={18} color="#fff" />
      </View>
      <View style={st.userInfo}>
        <Text style={st.userName}>{item.name || item.email}</Text>
        <Text style={st.userRole}>{item.user_type === 'driver' ? 'Conductor' : 'Pasajero'}</Text>
      </View>
      <View style={st.msgBtn}><Ionicons name="chatbubble" size={16} color="#A855F7" /></View>
    </TouchableOpacity>
  );

  const renderChatMsg = ({ item }: { item: SupportMsg }) => {
    const isAdmin = item.sender === 'admin';
    const isAI = item.sender === 'ai';
    return (
      <View style={[st.chatRow, isAdmin ? st.chatRowRight : st.chatRowLeft]}>
        {!isAdmin && (
          <View style={[st.chatAvatar, isAI ? st.chatAvatarAI : st.chatAvatarUser]}>
            <Ionicons name={isAI ? 'sparkles' : 'person'} size={12} color="#fff" />
          </View>
        )}
        <View style={[st.chatBubble, isAdmin ? st.chatBubbleAdmin : isAI ? st.chatBubbleAI : st.chatBubbleUser]}>
          <Text style={[st.chatText, isAdmin && { color: '#fff' }]}>{item.message}</Text>
        </View>
      </View>
    );
  };

  if (loading) return <SafeAreaView style={st.container}><ActivityIndicator size="large" color="#A855F7" style={{ marginTop: 40 }} /></SafeAreaView>;

  return (
    <SafeAreaView style={st.container}>
      <View style={st.header}><Text style={st.title}>Soporte y Mensajes</Text></View>
      <View style={st.tabs}>
        <TouchableOpacity style={[st.tab, tab === 'tickets' && st.tabActive]} onPress={() => setTab('tickets')}>
          <Ionicons name="chatbubbles" size={18} color={tab === 'tickets' ? '#A855F7' : '#8E8E93'} />
          <Text style={[st.tabText, tab === 'tickets' && st.tabTextActive]}>Tickets</Text>
          {tickets.filter(t => t.escalated).length > 0 && (
            <View style={st.tabBadge}><Text style={st.tabBadgeText}>{tickets.filter(t => t.escalated).length}</Text></View>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={[st.tab, tab === 'users' && st.tabActive]} onPress={() => setTab('users')}>
          <Ionicons name="people" size={18} color={tab === 'users' ? '#A855F7' : '#8E8E93'} />
          <Text style={[st.tabText, tab === 'users' && st.tabTextActive]}>Usuarios</Text>
        </TouchableOpacity>
      </View>

      {tab === 'tickets' ? (
        <FlatList data={tickets} keyExtractor={(item) => item.session_id} renderItem={renderTicket}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
          ListEmptyComponent={<View style={st.empty}><Ionicons name="chatbubbles-outline" size={48} color="#C7C7CC" /><Text style={st.emptyText}>No hay tickets de soporte</Text></View>}
        />
      ) : (
        <FlatList data={users.filter(u => u.user_type !== 'admin')} keyExtractor={(item) => item.user_id} renderItem={renderUser}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}
          ListEmptyComponent={<View style={st.empty}><Ionicons name="people-outline" size={48} color="#C7C7CC" /><Text style={st.emptyText}>No hay usuarios</Text></View>}
        />
      )}

      {/* Chat Modal */}
      <Modal visible={chatOpen} animationType="slide" onRequestClose={() => setChatOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={st.chatContainer}>
          <View style={st.chatHeader}>
            <TouchableOpacity onPress={() => setChatOpen(false)} style={st.chatCloseBtn}><Ionicons name="chevron-down" size={24} color="#1C1C1E" /></TouchableOpacity>
            <View style={st.chatHeaderCenter}>
              <Text style={st.chatHeaderName}>{chatUserName}</Text>
              <Text style={st.chatHeaderSub}>{isDirect ? 'Mensaje directo' : 'Ticket de soporte'}</Text>
            </View>
            <View style={{ width: 40 }} />
          </View>
          <FlatList data={chatMessages} keyExtractor={(item) => item.message_id} renderItem={renderChatMsg}
            style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} />
          <View style={st.chatInputBar}>
            <TextInput style={st.chatInput} value={chatInput} onChangeText={setChatInput}
              placeholder="Responder..." placeholderTextColor="#C7C7CC" multiline />
            <TouchableOpacity style={[st.chatSendBtn, (!chatInput.trim() || sending) && { opacity: 0.5 }]}
              onPress={handleSendReply} disabled={!chatInput.trim() || sending}>
              {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: { backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  title: { fontSize: 24, fontWeight: '800', color: '#1C1C1E' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 16, gap: 8, paddingBottom: 12 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: '#F2F2F7' },
  tabActive: { backgroundColor: '#E8FFD0' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#8E8E93' },
  tabTextActive: { color: '#A855F7' },
  tabBadge: { backgroundColor: '#FF3B30', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  tabBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  ticketCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, gap: 12 },
  ticketDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#C7C7CC' },
  ticketDotEscalated: { backgroundColor: '#FF3B30' },
  ticketInfo: { flex: 1 },
  ticketName: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  ticketMsg: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  escalatedBadge: { backgroundColor: '#FFE5E5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  escalatedText: { fontSize: 11, fontWeight: '700', color: '#FF3B30' },
  userCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, gap: 12 },
  userIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  userIconDriver: { backgroundColor: '#007AFF' },
  userIconRider: { backgroundColor: '#A855F7' },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  userRole: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  msgBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E8FFD0', justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 15, color: '#8E8E93', marginTop: 12 },
  chatContainer: { flex: 1, backgroundColor: '#F2F2F7' },
  chatHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: Platform.OS === 'ios' ? 56 : 36, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  chatCloseBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  chatHeaderCenter: { flex: 1, alignItems: 'center' },
  chatHeaderName: { fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  chatHeaderSub: { fontSize: 12, color: '#8E8E93' },
  chatRow: { marginBottom: 10, flexDirection: 'row', alignItems: 'flex-end' },
  chatRowRight: { justifyContent: 'flex-end' },
  chatRowLeft: { justifyContent: 'flex-start' },
  chatAvatar: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 6 },
  chatAvatarUser: { backgroundColor: '#FF9500' },
  chatAvatarAI: { backgroundColor: '#007AFF' },
  chatBubble: { maxWidth: '75%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  chatBubbleUser: { backgroundColor: '#E8E8ED' },
  chatBubbleAI: { backgroundColor: '#D4E5FF' },
  chatBubbleAdmin: { backgroundColor: '#A855F7', borderBottomRightRadius: 4 },
  chatText: { fontSize: 15, color: '#1C1C1E', lineHeight: 20 },
  chatInputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 8, paddingBottom: Platform.OS === 'ios' ? 28 : 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E5EA', gap: 8 },
  chatInput: { flex: 1, backgroundColor: '#F2F2F7', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 100, color: '#1C1C1E' },
  chatSendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#A855F7', justifyContent: 'center', alignItems: 'center' },
});
