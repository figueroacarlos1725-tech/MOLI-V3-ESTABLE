import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { socketService } from '@/src/services/socket';
import { useAuthStore } from '@/src/stores/authStore';
import { useRideStore } from '@/src/stores/rideStore';
import { MOLI_COLORS, MOLI_RADIUS, MOLI_SHADOWS } from '@/src/theme/colors';

interface IncomingMessage {
  message_id: string;
  ride_id: string;
  sender_id: string;
  sender_name: string;
  message: string;
}

export default function ChatNotificationBanner() {
  const { user } = useAuthStore();
  const { currentRide } = useRideStore();
  const router = useRouter();
  const [notification, setNotification] = useState<IncomingMessage | null>(null);
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;

    const unsub = socketService.on('new_message', (data: any) => {
      // Only show if the message is NOT from me
      if (data.sender_id !== user.user_id) {
        showNotification(data);
      }
    });

    return () => unsub();
  }, [user]);

  const showNotification = (msg: IncomingMessage) => {
    // Clear existing timeout
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    setNotification(msg);
    Vibration.vibrate(200);
    
    // Slide in
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
    
    // Auto-dismiss after 8 seconds
    timeoutRef.current = setTimeout(() => {
      dismiss();
    }, 8000);
  };

  const dismiss = () => {
    Animated.timing(slideAnim, {
      toValue: -120,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setNotification(null));
  };

  const openChat = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    dismiss();
    
    if (notification?.ride_id && currentRide) {
      router.push({
        pathname: '/chat',
        params: {
          rideId: notification.ride_id,
          otherName: notification.sender_name || 'Chat',
        },
      });
    }
  };

  if (!notification) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      <TouchableOpacity style={styles.content} onPress={openChat} activeOpacity={0.9}>
        <View style={styles.iconCircle}>
          <Ionicons name="chatbubble-ellipses" size={22} color="#fff" />
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.senderName} numberOfLines={1}>
            {notification.sender_name || 'Nuevo mensaje'}
          </Text>
          <Text style={styles.messagePreview} numberOfLines={1}>
            {notification.message}
          </Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={dismiss}>
          <Ionicons name="close" size={20} color="#8E8E93" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    left: 12,
    right: 12,
    zIndex: 9999,
    elevation: 20,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MOLI_COLORS.white,
    borderRadius: MOLI_RADIUS.lg,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#E7ECE9',
    ...MOLI_SHADOWS.lg,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: MOLI_COLORS.black,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textBlock: {
    flex: 1,
  },
  senderName: {
    fontSize: 15,
    fontWeight: '700',
    color: MOLI_COLORS.black,
  },
  messagePreview: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
});
