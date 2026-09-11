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
  rider_block_after_cancels?: number;
  rider_block_hours?: number;
  recent_cancel_count?: number;
}

interface CancelRideModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirmCancel: (reason: string, redispatch: boolean) => Promise<void>;
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
  const [reason, setReason] = useState('driver_too_far');

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
      await onConfirmCancel(reason, userType === 'rider' && ['driver_too_far', 'dont_want_driver'].includes(reason));
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

  const existingCancelCount = userType === 'driver' ? driverCancelCount : (cancelConfig?.recent_cancel_count || 0);
  const nextCancelNumber = existingCancelCount + 1;
  const blockAfter = userType === 'driver' ? (cancelConfig?.driver_block_after_cancels || 3) : (cancelConfig?.rider_block_after_cancels || 3);
  const blockHours = userType === 'driver' ? (cancelConfig?.driver_block_hours || 24) : (cancelConfig?.rider_block_hours || 24);
  const willBlock = nextCancelNumber >= blockAfter;

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

          <Text style={st.reasonTitle}>¿Por qué querés cancelar?</Text>
          <View style={st.reasons}>
            {(userType === 'rider' ? [
              ['driver_too_far', 'El conductor está muy lejos'],
              ['dont_want_driver', 'No quiero este conductor'],
              ['changed_mind', 'Cambié de opinión'],
              ['wrong_destination', 'Me equivoqué de destino'],
              ['other', 'Otro motivo'],
            ] : [
              ['passenger_absent', 'El pasajero no aparece'],
              ['unsafe_pickup', 'Lugar inseguro o inaccesible'],
              ['vehicle_issue', 'Problema con el vehículo'],
              ['personal_emergency', 'Emergencia personal'],
              ['other', 'Otro motivo'],
            ]).map(([value, label]) => <TouchableOpacity key={value} style={[st.reason, reason === value && st.reasonActive]} onPress={() => setReason(value)}>
              <Ionicons name={reason === value ? 'radio-button-on' : 'radio-button-off'} size={20} color={reason === value ? '#FF5A1F' : '#AAA'} />
              <Text style={[st.reasonText, reason === value && st.reasonTextActive]}>{label}</Text>
            </TouchableOpacity>)}
          </View>

          {userType === 'rider' && ['driver_too_far', 'dont_want_driver'].includes(reason) ? <View style={st.searchAgain}>
            <Ionicons name="refresh-circle" size={20} color="#FF5A1F" />
            <Text style={st.searchAgainText}>Al confirmar buscaremos otro conductor sin volver a ofrecerle el viaje al anterior.</Text>
          </View> : null}

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
                <View style={[st.infoBox, willBlock && st.infoBoxDanger]}>
                  <Ionicons name={willBlock ? 'alert-circle' : 'information-circle'} size={18} color={willBlock ? '#FF3B30' : '#FF5A1F'} />
                  <Text style={[st.infoText, willBlock && st.infoTextDanger]}>
                    {willBlock ? `Esta será tu cancelación #${nextCancelNumber}. Tu cuenta será bloqueada por ${blockHours}h.` : `La multa se sumará a tu próximo viaje. Cancelación ${nextCancelNumber}/${blockAfter} antes del bloqueo.`}
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
                      ? `Esta será tu cancelación #${nextCancelNumber}. Serás BLOQUEADO por ${blockHours}h.`
                      : `Cancelación #${nextCancelNumber} de ${blockAfter}. La multa se descontará de tu billetera.`}
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
  reasonTitle: { alignSelf: 'flex-start', fontSize: 14, fontWeight: '800', color: '#24201E', marginBottom: 8 },
  reasons: { width: '100%', gap: 7, marginBottom: 16 },
  reason: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, borderRadius: 13, backgroundColor: '#F7F5F3', borderWidth: 1, borderColor: '#EEE8E3' },
  reasonActive: { backgroundColor: '#FFF4ED', borderColor: '#FFB38F' },
  reasonText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#716A66' },
  reasonTextActive: { color: '#2B2522', fontWeight: '800' },
  searchAgain: { width: '100%', flexDirection: 'row', gap: 8, padding: 11, borderRadius: 12, backgroundColor: '#FFF4ED', marginBottom: 15 },
  searchAgainText: { flex: 1, fontSize: 12, lineHeight: 17, color: '#7A3B1D', fontWeight: '600' },
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
