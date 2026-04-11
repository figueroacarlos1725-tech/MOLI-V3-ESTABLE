import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

interface DriverBlockedModalProps {
  visible: boolean;
  reason: string;
  message: string;
  balance: number;
  blockedUntil: string | null;
  onChatSupport: () => void;
  onRechargeWallet: () => void;
}

export default function DriverBlockedModal({
  visible,
  reason,
  message,
  balance,
  blockedUntil,
  onChatSupport,
  onRechargeWallet,
}: DriverBlockedModalProps) {
  const isNegativeBalance = reason === 'negative_balance';

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={st.overlay}>
        <View style={st.card}>
          {/* Icon */}
          <View style={[st.iconCircle, isNegativeBalance ? st.iconWarn : st.iconBlock]}>
            <Ionicons
              name={isNegativeBalance ? 'wallet-outline' : 'ban-outline'}
              size={44}
              color="#fff"
            />
          </View>

          {/* Title */}
          <Text style={st.title}>
            {isNegativeBalance ? 'Saldo insuficiente' : 'Cuenta bloqueada'}
          </Text>

          {/* Message */}
          <Text style={st.message}>{message}</Text>

          {/* Balance */}
          <View style={st.balanceCard}>
            <Text style={st.balanceLabel}>Tu saldo actual</Text>
            <Text style={[st.balanceAmount, balance < 0 && st.balanceNeg]}>
              ${balance?.toFixed(2)}
            </Text>
          </View>

          {/* Timer */}
          {blockedUntil && (
            <View style={st.timerRow}>
              <Ionicons name="time-outline" size={18} color="#FF9500" />
              <Text style={st.timerText}>
                Bloqueo hasta: {new Date(blockedUntil).toLocaleString('es-AR')}
              </Text>
            </View>
          )}

          {/* Actions */}
          <View style={st.actions}>
            <TouchableOpacity style={st.btnPrimary} onPress={onRechargeWallet}>
              <Ionicons name="card-outline" size={20} color="#fff" />
              <Text style={st.btnPrimaryText}>Recargar billetera</Text>
            </TouchableOpacity>

            <TouchableOpacity style={st.btnSecondary} onPress={onChatSupport}>
              <Ionicons name="chatbubbles-outline" size={20} color="#6BBF00" />
              <Text style={st.btnSecondaryText}>Chat con soporte</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconWarn: { backgroundColor: '#FF9500' },
  iconBlock: { backgroundColor: '#FF3B30' },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C1C1E',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    color: '#636366',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  balanceCard: {
    width: '100%',
    backgroundColor: '#FFF5F5',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFE0E0',
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1C1C1E',
    marginTop: 4,
  },
  balanceNeg: { color: '#FF3B30' },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
    backgroundColor: '#FFF8E6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  timerText: {
    fontSize: 13,
    color: '#8B6914',
    fontWeight: '600',
  },
  actions: {
    width: '100%',
    gap: 10,
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6BBF00',
    borderRadius: 14,
    paddingVertical: 16,
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F2F2F7',
    borderRadius: 14,
    paddingVertical: 16,
  },
  btnSecondaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6BBF00',
  },
});
