import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { MapView } from '@/src/components/MapView';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  withSequence,
  withRepeat,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

// Simulated locations (Catamarca)
const FAKE_PICKUP = { latitude: -28.4650, longitude: -65.7780, address: 'Av. Güemes 450, Catamarca' };
const FAKE_DROPOFF = { latitude: -28.4750, longitude: -65.7900, address: 'San Martín 780, Catamarca' };
const FAKE_RIDER = { name: 'María García', rating: 4.8 };
const FAKE_FARE = 2500;
const FAKE_DISTANCE = '2.3 km';
const FAKE_DURATION = '8 min';

type TutorialStep =
  | 'welcome'
  | 'go_online'
  | 'waiting'
  | 'ride_offer'
  | 'accepted'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'done';

const STEP_CONFIG: Record<TutorialStep, { title: string; instruction: string; icon: string }> = {
  welcome: { title: '¡Bienvenido conductor!', instruction: 'Te vamos a guiar paso a paso para que aprendas cómo funciona Moli.', icon: 'school-outline' },
  go_online: { title: 'Paso 1: Ponete en línea', instruction: 'Tocá el botón para ponerte disponible y empezar a recibir viajes.', icon: 'power-outline' },
  waiting: { title: 'Esperando viajes...', instruction: 'Cuando estés en línea, los pasajeros cercanos te verán disponible.', icon: 'time-outline' },
  ride_offer: { title: '¡Nuevo viaje!', instruction: 'Un pasajero te solicita. Tocá "Aceptar" para tomar el viaje.', icon: 'car-outline' },
  accepted: { title: 'Viaje aceptado', instruction: 'Dirigite al punto de recogida. Cuando llegues, tocá "Llegué".', icon: 'navigate-outline' },
  arrived: { title: 'En el punto de recogida', instruction: 'El pasajero fue notificado. Cuando suba al vehículo, tocá "Iniciar viaje".', icon: 'person-outline' },
  in_progress: { title: 'Viaje en curso', instruction: 'Llevá al pasajero al destino. Cuando lleguen, tocá "Completar viaje".', icon: 'speedometer-outline' },
  completed: { title: '¡Viaje completado!', instruction: 'El cobro se realiza automáticamente. Tu comisión se acredita al instante.', icon: 'checkmark-circle-outline' },
  done: { title: '¡Tutorial completado!', instruction: 'Ya sabés cómo funciona Moli. ¡Subí tus documentos para empezar a ganar!', icon: 'trophy-outline' },
};

export default function DriverTutorialScreen() {
  const router = useRouter();
  const [step, setStep] = useState<TutorialStep>('welcome');
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animations
  const cardScale = useSharedValue(0.9);
  const cardOpacity = useSharedValue(0);
  const pulseScale = useSharedValue(1);
  const buttonScale = useSharedValue(1);
  const progressWidth = useSharedValue(0);

  const stepIndex = Object.keys(STEP_CONFIG).indexOf(step);
  const totalSteps = Object.keys(STEP_CONFIG).length;

  useEffect(() => {
    // Animate card on step change
    cardOpacity.value = 0;
    cardScale.value = 0.9;
    cardOpacity.value = withDelay(100, withTiming(1, { duration: 300 }));
    cardScale.value = withDelay(100, withSpring(1, { damping: 15 }));
    progressWidth.value = withTiming((stepIndex / (totalSteps - 1)) * 100, { duration: 500 });

    // Pulse animation for action button
    buttonScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [step]);

  useEffect(() => {
    // Auto-advance for waiting step
    if (step === 'waiting') {
      const timer = setTimeout(() => setStep('ride_offer'), 2500);
      return () => clearTimeout(timer);
    }
  }, [step]);

  useEffect(() => {
    // Countdown for ride offer
    if (step === 'ride_offer') {
      setCountdown(8);
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
    }
  }, [step]);

  const handleAction = () => {
    switch (step) {
      case 'welcome': setStep('go_online'); break;
      case 'go_online': setStep('waiting'); break;
      case 'ride_offer':
        if (countdownRef.current) clearInterval(countdownRef.current);
        setStep('accepted');
        break;
      case 'accepted': setStep('arrived'); break;
      case 'arrived': setStep('in_progress'); break;
      case 'in_progress': setStep('completed'); break;
      case 'completed': setStep('done'); break;
      case 'done':
        AsyncStorage.setItem('tutorial_completed', 'true');
        router.replace('/(driver)/home');
        break;
    }
  };

  const getActionLabel = () => {
    switch (step) {
      case 'welcome': return 'Comenzar tutorial';
      case 'go_online': return 'Ponerme en línea';
      case 'waiting': return '';
      case 'ride_offer': return `Aceptar viaje (${countdown}s)`;
      case 'accepted': return 'Llegué al punto';
      case 'arrived': return 'Iniciar viaje';
      case 'in_progress': return 'Completar viaje';
      case 'completed': return 'Continuar';
      case 'done': return 'Ir a la app';
    }
  };

  const getActionColor = () => {
    if (step === 'ride_offer') return '#00C853';
    if (step === 'go_online') return '#00C853';
    if (step === 'done') return '#00C853';
    return '#7B2D8E';
  };

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ scale: cardScale.value }],
  }));

  const buttonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const config = STEP_CONFIG[step];

  // Markers for map
  const markers = [];
  if (step !== 'welcome' && step !== 'go_online') {
    markers.push({ latitude: FAKE_PICKUP.latitude, longitude: FAKE_PICKUP.longitude, title: 'Recogida', type: 'pickup' as const });
    if (step !== 'waiting') {
      markers.push({ latitude: FAKE_DROPOFF.latitude, longitude: FAKE_DROPOFF.longitude, title: 'Destino', type: 'dropoff' as const });
    }
  }

  return (
    <SafeAreaView style={s.container}>
      {/* Map background */}
      <View style={s.mapContainer}>
        <MapView
          initialRegion={{ latitude: -28.4696, longitude: -65.7852 }}
          markers={markers}
          showRoute={step !== 'welcome' && step !== 'go_online' && step !== 'waiting'}
        />
        {/* Tutorial overlay gradient */}
        <View style={s.mapOverlay} />
      </View>

      {/* Progress bar */}
      <View style={s.progressContainer}>
        <View style={s.progressBg}>
          <Animated.View style={[s.progressFill, progressStyle]} />
        </View>
        <Text style={s.progressText}>Paso {stepIndex + 1} de {totalSteps}</Text>
      </View>

      {/* Skip button */}
      <TouchableOpacity
        style={s.skipBtn}
        onPress={() => {
          AsyncStorage.setItem('tutorial_completed', 'true');
          router.replace('/(driver)/home');
        }}
      >
        <Text style={s.skipText}>Saltar</Text>
        <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.5)" />
      </TouchableOpacity>

      {/* Tutorial Card */}
      <View style={s.bottomArea}>
        <Animated.View style={[s.card, cardStyle]}>
          {/* Step icon */}
          <View style={s.stepIconRow}>
            <View style={s.stepIconBg}>
              <Ionicons name={config.icon as any} size={28} color="#00C853" />
            </View>
            <View style={s.stepLabel}>
              <Text style={s.stepLabelText}>SIMULACIÓN</Text>
            </View>
          </View>

          {/* Title & instruction */}
          <Text style={s.cardTitle}>{config.title}</Text>
          <Text style={s.cardInstruction}>{config.instruction}</Text>

          {/* Ride offer details */}
          {step === 'ride_offer' && (
            <View style={s.offerCard}>
              <View style={s.offerRow}>
                <View style={s.offerAvatar}>
                  <Ionicons name="person" size={20} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.offerName}>{FAKE_RIDER.name}</Text>
                  <View style={s.ratingRow}>
                    <Ionicons name="star" size={12} color="#FFCC00" />
                    <Text style={s.ratingText}>{FAKE_RIDER.rating}</Text>
                  </View>
                </View>
                <Text style={s.offerFare}>${FAKE_FARE.toLocaleString()}</Text>
              </View>
              <View style={s.offerDetails}>
                <View style={s.offerDetail}>
                  <Ionicons name="location" size={14} color="#00C853" />
                  <Text style={s.offerDetailText}>{FAKE_PICKUP.address}</Text>
                </View>
                <View style={s.offerDetail}>
                  <Ionicons name="flag" size={14} color="#FF3B30" />
                  <Text style={s.offerDetailText}>{FAKE_DROPOFF.address}</Text>
                </View>
              </View>
              <View style={s.offerMeta}>
                <Text style={s.metaText}>{FAKE_DISTANCE}</Text>
                <View style={s.metaDot} />
                <Text style={s.metaText}>{FAKE_DURATION}</Text>
              </View>
            </View>
          )}

          {/* Completed stats */}
          {step === 'completed' && (
            <View style={s.completedCard}>
              <View style={s.completedStat}>
                <Text style={s.completedStatValue}>${FAKE_FARE.toLocaleString()}</Text>
                <Text style={s.completedStatLabel}>Ganancia</Text>
              </View>
              <View style={s.completedDivider} />
              <View style={s.completedStat}>
                <Text style={s.completedStatValue}>{FAKE_DISTANCE}</Text>
                <Text style={s.completedStatLabel}>Distancia</Text>
              </View>
              <View style={s.completedDivider} />
              <View style={s.completedStat}>
                <Text style={s.completedStatValue}>{FAKE_DURATION}</Text>
                <Text style={s.completedStatLabel}>Duración</Text>
              </View>
            </View>
          )}

          {/* Action button */}
          {step !== 'waiting' && (
            <Animated.View style={buttonAnimStyle}>
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: getActionColor() }]}
                onPress={handleAction}
                activeOpacity={0.8}
              >
                <Text style={s.actionBtnText}>{getActionLabel()}</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Waiting spinner */}
          {step === 'waiting' && (
            <View style={s.waitingRow}>
              <View style={s.waitingDot} />
              <View style={[s.waitingDot, { animationDelay: '0.2s' }]} />
              <View style={[s.waitingDot, { animationDelay: '0.4s' }]} />
              <Text style={s.waitingText}>Buscando pasajeros cercanos...</Text>
            </View>
          )}
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#7B2D8E' },
  mapContainer: { ...StyleSheet.absoluteFillObject },
  mapOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.55,
    backgroundColor: 'transparent',
  },
  // Progress
  progressContainer: {
    position: 'absolute', top: Platform.OS === 'ios' ? 54 : 38,
    left: 16, right: 70, zIndex: 10,
  },
  progressBg: { height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#00C853', borderRadius: 2 },
  progressText: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: '600', marginTop: 4 },
  // Skip
  skipBtn: {
    position: 'absolute', top: Platform.OS === 'ios' ? 50 : 34,
    right: 16, zIndex: 10, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  skipText: { fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  // Bottom card
  bottomArea: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderRadius: 24, padding: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  stepIconRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  stepIconBg: {
    width: 48, height: 48, borderRadius: 16,
    backgroundColor: 'rgba(0,200,83,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  stepLabel: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
    backgroundColor: 'rgba(0,200,83,0.15)',
  },
  stepLabelText: { fontSize: 10, fontWeight: '800', color: '#00C853', letterSpacing: 1 },
  cardTitle: { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 6 },
  cardInstruction: { fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 20, marginBottom: 16 },
  // Offer card
  offerCard: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 14,
    marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  offerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  offerAvatar: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(0,200,83,0.2)', justifyContent: 'center', alignItems: 'center',
  },
  offerName: { fontSize: 16, fontWeight: '700', color: '#fff' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { fontSize: 13, color: '#FFCC00', fontWeight: '600' },
  offerFare: { fontSize: 22, fontWeight: '900', color: '#00C853' },
  offerDetails: { gap: 8 },
  offerDetail: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  offerDetailText: { fontSize: 13, color: 'rgba(255,255,255,0.6)', flex: 1 },
  offerMeta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  metaText: { fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  metaDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' },
  // Completed
  completedCard: {
    flexDirection: 'row', backgroundColor: 'rgba(0,200,83,0.08)',
    borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(0,200,83,0.15)',
  },
  completedStat: { flex: 1, alignItems: 'center' },
  completedStatValue: { fontSize: 20, fontWeight: '900', color: '#00C853' },
  completedStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: '500', marginTop: 2 },
  completedDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  // Action
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 16,
  },
  actionBtnText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  // Waiting
  waitingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 16,
  },
  waitingDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#00C853', opacity: 0.6,
  },
  waitingText: { fontSize: 14, color: 'rgba(255,255,255,0.4)', fontWeight: '500', marginLeft: 8 },
});
