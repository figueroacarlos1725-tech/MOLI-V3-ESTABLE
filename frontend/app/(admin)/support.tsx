import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import { apiService } from '@/src/services/api';
import { socketService } from '@/src/services/socket';

interface SupportTicket {
  ticket_id: string;
  user_id: string;
  session_id: string;
  status: string;
  dispatcher_id?: string;
  user_info?: {
    name: string;
    email: string;
    user_type: string;
  };
  created_at: string;
}

interface ChatMessage {
  message_id: string;
  sender_id: string;
  message: string;
  is_ai: boolean;
  created_at: string;
}

export default function AdminSupportScreen() {
  const { user } = useAuthStore();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isAiActive, setIsAiActive] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    fetchTickets();
    
    // Listen for new tickets
    const unsubscribe = socketService.on('new_support_ticket', (data: any) => {
      if (data.ticket) {
        setTickets(prev => [data.ticket, ...prev]);
      }
    });

    return () => unsubscribe();
  }, []);

  const fetchTickets = async () => {
    try {
      const response = await apiService.get('/dispatcher/tickets');
      setTickets(response.tickets || []);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    }
  };

  const handleTakeTicket = async (ticketId: string) => {
    try {
      await apiService.post(`/dispatcher/tickets/${ticketId}/take`);
      fetchTickets();
    } catch (error) {
      console.error('Error taking ticket:', error);
    }
  };

  const handleSelectTicket = async (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    // Fetch chat history for this session
    // For now, we'll show an empty chat
    setMessages([]);
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedTicket) return;

    const message: ChatMessage = {
      message_id: `msg_${Date.now()}`,
      sender_id: user?.user_id || '',
      message: newMessage,
      is_ai: false,
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, message]);
    setNewMessage('');

    // Send via WebSocket to the user
    socketService.sendChatMessage(selectedTicket.user_id, newMessage);
  };

  const renderTicketItem = ({ item }: { item: SupportTicket }) => (
    <TouchableOpacity
      style={[
        styles.ticketCard,
        selectedTicket?.ticket_id === item.ticket_id && styles.ticketCardSelected
      ]}
      onPress={() => handleSelectTicket(item)}
    >
      <View style={styles.ticketHeader}>
        <View style={styles.ticketUser}>
          <Ionicons name="person" size={20} color="#8E44AD" />
          <Text style={styles.ticketUserName}>{item.user_info?.name || 'Unknown'}</Text>
        </View>
        <View style={[
          styles.statusBadge,
          { backgroundColor: item.status === 'waiting' ? '#FFF3E0' : '#E8F5E9' }
        ]}>
          <Text style={[
            styles.statusText,
            { color: item.status === 'waiting' ? '#FF9500' : '#34C759' }
          ]}>
            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          </Text>
        </View>
      </View>
      <Text style={styles.ticketEmail}>{item.user_info?.email}</Text>
      {item.status === 'waiting' && (
        <TouchableOpacity
          style={styles.takeButton}
          onPress={() => handleTakeTicket(item.ticket_id)}
        >
          <Text style={styles.takeButtonText}>Take Ticket</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <View style={[
      styles.messageContainer,
      item.sender_id === user?.user_id ? styles.myMessage : styles.otherMessage
    ]}>
      {item.is_ai && (
        <View style={styles.aiBadge}>
          <Ionicons name="sparkles" size={12} color="#8E44AD" />
          <Text style={styles.aiBadgeText}>AI</Text>
        </View>
      )}
      <Text style={[
        styles.messageText,
        item.sender_id === user?.user_id ? styles.myMessageText : styles.otherMessageText
      ]}>
        {item.message}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.splitView}>
        {/* Tickets List */}
        <View style={styles.ticketsList}>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>Support Tickets</Text>
            <TouchableOpacity onPress={fetchTickets}>
              <Ionicons name="refresh" size={20} color="#8E44AD" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={tickets}
            renderItem={renderTicketItem}
            keyExtractor={(item) => item.ticket_id}
            contentContainerStyle={styles.ticketsContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="chatbubbles-outline" size={48} color="#E5E5EA" />
                <Text style={styles.emptyText}>No tickets</Text>
              </View>
            }
          />
        </View>

        {/* Chat View */}
        <View style={styles.chatView}>
          {selectedTicket ? (
            <KeyboardAvoidingView
              style={styles.chatContainer}
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
              <View style={styles.chatHeader}>
                <View>
                  <Text style={styles.chatTitle}>{selectedTicket.user_info?.name}</Text>
                  <Text style={styles.chatSubtitle}>{selectedTicket.user_info?.email}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.aiToggle, isAiActive && styles.aiToggleActive]}
                  onPress={() => setIsAiActive(!isAiActive)}
                >
                  <Ionicons name="sparkles" size={16} color={isAiActive ? '#fff' : '#8E44AD'} />
                  <Text style={[styles.aiToggleText, isAiActive && styles.aiToggleTextActive]}>
                    AI {isAiActive ? 'On' : 'Off'}
                  </Text>
                </TouchableOpacity>
              </View>

              <FlatList
                ref={flatListRef}
                data={messages}
                renderItem={renderMessage}
                keyExtractor={(item) => item.message_id}
                contentContainerStyle={styles.messagesContent}
                onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
              />

              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  value={newMessage}
                  onChangeText={setNewMessage}
                  placeholder="Type a message..."
                  multiline
                />
                <TouchableOpacity
                  style={styles.sendButton}
                  onPress={handleSendMessage}
                  disabled={!newMessage.trim()}
                >
                  <Ionicons
                    name="send"
                    size={20}
                    color={newMessage.trim() ? '#8E44AD' : '#C7C7CC'}
                  />
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          ) : (
            <View style={styles.noChatContainer}>
              <Ionicons name="chatbubbles-outline" size={64} color="#E5E5EA" />
              <Text style={styles.noChatText}>Select a ticket to start chatting</Text>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  splitView: {
    flex: 1,
    flexDirection: 'row',
  },
  ticketsList: {
    width: '40%',
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderRightColor: '#E5E5EA',
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  ticketsContent: {
    padding: 12,
  },
  ticketCard: {
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  ticketCardSelected: {
    backgroundColor: '#F3E5F5',
    borderWidth: 2,
    borderColor: '#8E44AD',
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ticketUser: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ticketUserName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    marginLeft: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  ticketEmail: {
    fontSize: 12,
    color: '#8E8E93',
  },
  takeButton: {
    backgroundColor: '#8E44AD',
    borderRadius: 8,
    paddingVertical: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  takeButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 12,
  },
  chatView: {
    flex: 1,
  },
  chatContainer: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  chatTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  chatSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  aiToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F3E5F5',
  },
  aiToggleActive: {
    backgroundColor: '#8E44AD',
  },
  aiToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E44AD',
    marginLeft: 4,
  },
  aiToggleTextActive: {
    color: '#fff',
  },
  messagesContent: {
    padding: 16,
  },
  messageContainer: {
    maxWidth: '80%',
    marginBottom: 12,
    padding: 12,
    borderRadius: 16,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#8E44AD',
  },
  otherMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
  },
  messageText: {
    fontSize: 15,
  },
  myMessageText: {
    color: '#fff',
  },
  otherMessageText: {
    color: '#1C1C1E',
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  aiBadgeText: {
    fontSize: 10,
    color: '#8E44AD',
    marginLeft: 4,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  input: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    padding: 10,
    marginLeft: 8,
  },
  noChatContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noChatText: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 16,
  },
});
