import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface CancelConfig {
  cancel_free_minutes: number;
  rider_cancel_penalty: number;
  driver_cancel_penalty: number;
  driver_block_after_cancels: number;
  driver_block_hours: number;
  currency_symbol: string;
}

interface CancelRideModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirmCancel: () => Promise<void>;
  userType: 'rider' | 'driver';
  rideAcceptedAt: string | null;
  cancelConfig: CancelConfig | null;
  driverCancelCount?: number;
}

export default function CancelRideModal({
  visible,
  onClose,
  onConfirmCancel,
  userType,
  rideAcceptedAt,
  cancelConfig,
  driverCancelCount = 0,
}: CancelRideModalProps) {
  const [isCancelling, setIsCancelling] = useState(false);
  const [isFreePeriod, setIsFreePeriod] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!visible || !rideAcceptedAt || !cancelConfig) return;
    
    const checkTime = () => {
      const accepted = new Date(rideAcceptedAt);
      const now = new Date();
      const elapsed = (now.getTime() - accepted.getTime()) / 1000;
      setElapsedSeconds(Math.floor(elapsed));
      setIsFreePeriod(elapsed <= cancelConfig.cancel_free_minutes * 60);
    };
    
    checkTime();
    const interval = setInterval(checkTime, 1000);
    return () => clearInterval(interval);
  }, [visible, rideAcceptedAt, cancelConfig]);

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      await onConfirmCancel();
    } finally {
      setIsCancelling(false);
    }
  };

  const freeTimeLeft = cancelConfig 
    ? Math.max(0, cancelConfig.cancel_free_minutes * 60 - elapsedSeconds)
    : 0;

  const penalty = userType === 'rider' 
    ? cancelConfig?.rider_cancel_penalty || 0
    : cancelConfig?.driver_cancel_penalty || 0;

  const nextCancelNumber = driverCancelCount + 1;
  const willBlock = userType === 'driver' && nextCancelNumber >= (cancelConfig?.driver_block_after_cancels || 3);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={st.overlay}>
        <View style={st.card}>
          {/* Header icon */}
          <View style={[st.iconCircle, isFreePeriod ? st.iconGreen : st.iconRed]}>
            <Ionicons
              name={isFreePeriod ? 'checkmark-circle' : 'warning'}
              size={36}
              color="#fff"
            />
          </View>

          <Text style={st.title}>
            {isFreePeriod ? 'Cancelar sin cargo' : 'Cancelar con multa'}
          </Text>

          {isFreePeriod ? (
            <>
              <Text style={st.desc}>
                Puedes cancelar sin cargo. Te quedan:
              </Text>
              <View style={st.timerBadge}>
                <Ionicons name="time" size={18} color="#00C853" />
                <Text style={st.timerText}>
                  {Math.floor(freeTimeLeft / 60)}:{String(freeTimeLeft % 60).padStart(2, '0')}
                </Text>
              </View>
            </>
          ) : (
            <>
              <Text style={st.desc}>
                El tiempo de cancelación gratuita ha pasado.{'\n'}
                Se aplicará una multa de:
              </Text>
              <View style={st.penaltyBadge}>
                <Text style={st.penaltyAmount}>
                  {cancelConfig?.currency_symbol || '$'}{penalty.toLocaleString()}
                </Text>
              </View>

              {userType === 'rider' && (
                <View style={st.infoBox}>
                  <Ionicons name="information-circle" size={18} color="#007AFF" />
                  <Text style={st.infoText}>
                    La multa se sumará al costo de tu próximo viaje.
                  </Text>
                </View>
              )}

              {userType === 'driver' && (
                <View style={[st.infoBox, willBlock && st.infoBoxDanger]}>
                  <Ionicons
                    name={willBlock ? 'alert-circle' : 'information-circle'}
                    size={18}
                    color={willBlock ? '#FF3B30' : '#FF9500'}
                  />
                  <Text style={[st.infoText, willBlock && st.infoTextDanger]}>
                    {willBlock
                      ? `Esta será tu cancelación #${nextCancelNumber}. Serás BLOQUEADO por ${cancelConfig?.driver_block_hours || 24}h.`
                      : `Cancelación #${nextCancelNumber} de ${cancelConfig?.driver_block_after_cancels || 3}. La multa se descontará de tu billetera.`}
                  </Text>
                </View>
              )}
            </>
          )}

          {/* Actions */}
          <View style={st.actions}>
            <TouchableOpacity
              style={[st.btnCancel, !isFreePeriod && st.btnCancelDanger]}
              onPress={handleCancel}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={st.btnCancelText}>
                  {isFreePeriod ? 'Sí, cancelar gratis' : `Cancelar (multa ${cancelConfig?.currency_symbol || '$'}${penalty.toLocaleString()})`}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={st.btnKeep} onPress={onClose}>
              <Text style={st.btnKeepText}>Mantener viaje</Text>
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
    backgroundColor: 'rgba(0,0,0,0.6)',
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
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconGreen: { backgroundColor: '#00C853' },
  iconRed: { backgroundColor: '#FF9500' },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1C1E',
    textAlign: 'center',
    marginBottom: 8,
  },
  desc: {
    fontSize: 15,
    color: '#636366',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FFF0',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  timerText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#00C853',
  },
  penaltyBadge: {
    backgroundColor: '#FFF5F5',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE0E0',
    marginBottom: 16,
  },
  penaltyAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FF3B30',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F0F8FF',
    padding: 12,
    borderRadius: 10,
    marginBottom: 20,
    width: '100%',
  },
  infoBoxDanger: {
    backgroundColor: '#FFF5F5',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#636366',
    lineHeight: 19,
  },
  infoTextDanger: {
    color: '#FF3B30',
    fontWeight: '600',
  },
  actions: {
    width: '100%',
    gap: 10,
  },
  btnCancel: {
    backgroundColor: '#FF9500',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnCancelDanger: {
    backgroundColor: '#FF3B30',
  },
  btnCancelText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  btnKeep: {
    backgroundColor: '#F2F2F7',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnKeepText: {
    color: '#00C853',
    fontSize: 16,
    fontWeight: '700',
  },
});
