import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Switch,
  Modal,
  ScrollView,
  Linking,
  Platform,
  Vibration,
  Animated,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { MapView } from '@/src/components/MapView';
import { Button } from '@/src/components/Button';
import { useAuthStore } from '@/src/stores/authStore';
import { useRideStore } from '@/src/stores/rideStore';
import { socketService } from '@/src/services/socket';
import { apiService } from '@/src/services/api';
import { getCurrentLocation, reverseGeocode } from '@/src/utils/location';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';

const COUNTDOWN_SECONDS = 8;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface RideOffer {
  request_id: string;
  countdown: number;
  pickup: any;
  dropoff: any;
  fare: number;
  distance_km: number;
  duration_min: number;
  vehicle_type: string;
  rider_name: string;
}

export default function DriverHomeScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const { currentRide, fetchActiveRide, updateRideStatus } = useRideStore();
  
  const [isOnline, setIsOnline] = useState(false);
  const [isLoadingRide, setIsLoadingRide] = useState(true);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const locationInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Dispatch popup state
  const [rideOffer, setRideOffer] = useState<RideOffer | null>(null);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [isResponding, setIsResponding] = useState(false);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const soundRef = useRef<Audio.Sound | null>(null);
  const rideOfferRef = useRef<RideOffer | null>(null);
  const isRespondingRef = useRef(false);

  // Inline confirm for toggle
  const [confirmOnline, setConfirmOnline] = useState(false);
  const [confirmOffline, setConfirmOffline] = useState(false);

  useEffect(() => {
    initializeLocation();
    
    // Restore active ride on mount
    const restoreRide = async () => {
      setIsLoadingRide(true);
      try {
        const ride = await fetchActiveRide();
        if (ride && ['accepted', 'arrived', 'started'].includes(ride.status)) {
          // Auto-restore online state when there's an active ride
          setIsOnline(true);
          setStatusMessage('Viaje activo restaurado');
        }
      } catch (e) {
        // ignore
      } finally {
        setIsLoadingRide(false);
      }
    };
    restoreRide();
    
    return () => {
      if (locationInterval.current) clearInterval(locationInterval.current);
      if (countdownInterval.current) clearInterval(countdownInterval.current);
      stopSound();
    };
  }, []);

  // Connect WebSocket and listen for offers
  useEffect(() => {
    if (user && isOnline) {
      socketService.connect(user.user_id);

      const unsubOffer = socketService.on('ride_offer', (data: any) => {
        console.log('Ride offer received:', data);
        showRideOffer(data);
      });

      const unsubExpired = socketService.on('ride_offer_expired', (data: any) => {
        console.log('Ride offer expired:', data);
        clearOffer();
      });

      const unsubAccepted = socketService.on('bid_accepted', (data: any) => {
        console.log('Ride accepted confirmation:', data);
        fetchActiveRide();
      });
      
      startLocationUpdates();
      
      return () => {
        unsubOffer();
        unsubExpired();
        unsubAccepted();
        if (locationInterval.current) clearInterval(locationInterval.current);
      };
    }
  }, [user, isOnline]);

  const initializeLocation = async () => {
    const location = await getCurrentLocation();
    if (location) setUserLocation(location);
  };

  const startLocationUpdates = () => {
    if (locationInterval.current) clearInterval(locationInterval.current);
    
    locationInterval.current = setInterval(async () => {
      const location = await getCurrentLocation();
      if (location && isOnline) {
        setUserLocation(location);
        socketService.sendLocation(location.latitude, location.longitude);
        // Also update via API
        try {
          await apiService.put(`/drivers/location?latitude=${location.latitude}&longitude=${location.longitude}`);
        } catch (e) { /* ignore */ }
      }
    }, 10000);
  };

  // ==================== SOUND & VIBRATION ====================
  const playAlertSound = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
      });
      // Use a simple system-like beep via expo-av
      const { sound } = await Audio.Sound.createAsync(
        { uri: 'https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg' },
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );
      soundRef.current = sound;
    } catch (e) {
      console.log('Sound play error (non-critical):', e);
    }
  };

  const stopSound = async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    } catch (e) { /* ignore */ }
  };

  const triggerVibration = () => {
    // Vibrate pattern: vibrate 500ms, pause 300ms, repeat
    const pattern = [0, 500, 300, 500, 300, 500, 300, 500];
    Vibration.vibrate(pattern, false);
    // Also use Haptics for iOS
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (e) { /* ignore */ }
  };

  // ==================== RIDE OFFER LOGIC ====================
  const showRideOffer = (data: RideOffer) => {
    clearOffer();
    
    rideOfferRef.current = data;
    isRespondingRef.current = false;
    setRideOffer(data);
    setCountdown(COUNTDOWN_SECONDS);
    
    triggerVibration();
    playAlertSound();
    
    progressAnim.setValue(1);
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: COUNTDOWN_SECONDS * 1000,
      useNativeDriver: false,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    ).start();
    
    let timeLeft = COUNTDOWN_SECONDS;
    countdownInterval.current = setInterval(() => {
      timeLeft -= 1;
      setCountdown(timeLeft);
      
      if (timeLeft <= 3 && timeLeft > 0) {
        Vibration.vibrate(200);
      }
      
      if (timeLeft <= 0) {
        // STOP interval immediately
        if (countdownInterval.current) {
          clearInterval(countdownInterval.current);
          countdownInterval.current = null;
        }
        // Auto-reject using ref (avoids stale closure)
        autoRejectOffer();
      }
    }, 1000);
  };

  const autoRejectOffer = async () => {
    const offer = rideOfferRef.current;
    if (!offer || isRespondingRef.current) return;
    isRespondingRef.current = true;
    stopSound();
    Vibration.cancel();
    try {
      await apiService.post(`/rides/${offer.request_id}/driver-response?action=reject`);
    } catch (e) { /* ignore */ }
    clearOffer();
  };

  const clearOffer = () => {
    if (countdownInterval.current) {
      clearInterval(countdownInterval.current);
      countdownInterval.current = null;
    }
    stopSound();
    Vibration.cancel();
    progressAnim.stopAnimation();
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
    rideOfferRef.current = null;
    isRespondingRef.current = false;
    setRideOffer(null);
    setCountdown(COUNTDOWN_SECONDS);
    setIsResponding(false);
  };

  const handleAcceptOffer = async () => {
    const offer = rideOfferRef.current;
    if (!offer || isRespondingRef.current) return;
    isRespondingRef.current = true;
    setIsResponding(true);
    stopSound();
    Vibration.cancel();
    // Stop countdown
    if (countdownInterval.current) {
      clearInterval(countdownInterval.current);
      countdownInterval.current = null;
    }
    
    try {
      const response = await apiService.post(
        `/rides/${offer.request_id}/driver-response?action=accept`
      );
      
      if (response.status === 'accepted') {
        setStatusMessage('¡Viaje aceptado! Dirígete al punto de recogida');
        fetchActiveRide();
      }
    } catch (error: any) {
      setStatusMessage(error.message || 'Error al aceptar el viaje');
    } finally {
      clearOffer();
    }
  };

  const handleRejectOffer = async (isTimeout = false) => {
    const offer = rideOfferRef.current;
    if (!offer || isRespondingRef.current) return;
    isRespondingRef.current = true;
    setIsResponding(true);
    stopSound();
    Vibration.cancel();
    // Stop countdown
    if (countdownInterval.current) {
      clearInterval(countdownInterval.current);
      countdownInterval.current = null;
    }
    
    try {
      await apiService.post(
        `/rides/${offer.request_id}/driver-response?action=reject`
      );
      if (!isTimeout) {
        setStatusMessage('Oferta rechazada');
      }
    } catch (error: any) {
      console.error('Error rejecting offer:', error);
    } finally {
      clearOffer();
    }
  };

  // ==================== TOGGLE ONLINE ====================
  const handleToggleOnline = async (value: boolean) => {
    if (value) {
      setConfirmOnline(true);
    } else {
      setConfirmOffline(true);
    }
  };

  const confirmGoOnline = async () => {
    setConfirmOnline(false);
    try {
      await apiService.put(
        `/drivers/availability?is_online=true${userLocation ? `&latitude=${userLocation.latitude}&longitude=${userLocation.longitude}` : ''}`
      );
      setIsOnline(true);
      setStatusMessage('Estás en línea. Esperando solicitudes...');
    } catch (error: any) {
      setStatusMessage(error.message || 'No se pudo conectar');
    }
  };

  const confirmGoOffline = async () => {
    setConfirmOffline(false);
    try {
      await apiService.put(
        `/drivers/availability?is_online=false${userLocation ? `&latitude=${userLocation.latitude}&longitude=${userLocation.longitude}` : ''}`
      );
      setIsOnline(false);
      setStatusMessage('Estás desconectado');
      socketService.disconnect();
    } catch (error: any) {
      setStatusMessage(error.message || 'Error al desconectar');
    }
  };

  const handleUpdateRideStatus = async (status: string) => {
    if (!currentRide) return;
    try {
      await updateRideStatus(currentRide.ride_id, status);
      if (status === 'completed') {
        setStatusMessage(`¡Viaje completado! Ganaste $${currentRide.driver_earnings?.toFixed(2) || currentRide.fare?.toFixed(2)}`);
        fetchActiveRide();
      }
    } catch (error: any) {
      setStatusMessage(error.message || 'Error al actualizar estado');
    }
  };

  const getMapMarkers = () => {
    const markers = [];
    if (userLocation) {
      markers.push({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        title: 'Tu ubicación',
        type: 'driver' as const,
      });
    }
    if (currentRide) {
      markers.push({
        latitude: currentRide.pickup_location.latitude,
        longitude: currentRide.pickup_location.longitude,
        title: 'Recogida',
        type: 'pickup' as const,
      });
      markers.push({
        latitude: currentRide.dropoff_location.latitude,
        longitude: currentRide.dropoff_location.longitude,
        title: 'Destino',
        type: 'dropoff' as const,
      });
    }
    return markers;
  };

  const emojiMap: Record<string, string> = { economy: '🚗', comfort: '🚙', premium: '🏎️', xl: '🚌' };
  const nameMap: Record<string, string> = { economy: 'Económico', comfort: 'Confort', premium: 'Premium', xl: 'XL' };

  // ==================== LOADING STATE ====================
  if (isLoadingRide) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#6BBF00" />
          <Text style={{ marginTop: 16, fontSize: 16, color: '#8E8E93' }}>Cargando viaje...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ==================== ACTIVE RIDE VIEW ====================
  if (currentRide && ['accepted', 'arrived', 'started'].includes(currentRide.status)) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.mapContainer}>
          <MapView
            initialRegion={userLocation}
            markers={getMapMarkers()}
            showRoute={true}
          />
        </View>
        
        <View style={styles.activeRidePanel}>
          <View style={styles.rideStatusBadge}>
            <Text style={styles.rideStatusText}>
              {currentRide.status === 'accepted' ? 'Ir a recoger' :
               currentRide.status === 'arrived' ? 'Esperando al pasajero' : 'En viaje'}
            </Text>
          </View>
          
          {currentRide.rider_info && (
            <View style={styles.riderInfo}>
              <View style={styles.riderAvatar}>
                <Ionicons name="person" size={24} color="#6BBF00" />
              </View>
              <View style={styles.riderDetails}>
                <Text style={styles.riderName}>{currentRide.rider_info.name}</Text>
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={14} color="#FFD700" />
                  <Text style={styles.ratingText}>{currentRide.rider_info.rating?.toFixed(1)}</Text>
                </View>
              </View>
              <View style={styles.riderActions}>
                <TouchableOpacity style={styles.actionButtonSmall}>
                  <Ionicons name="call" size={22} color="#6BBF00" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButtonSmall}
                  onPress={() => router.push({
                    pathname: '/chat',
                    params: { rideId: currentRide.ride_id, otherName: currentRide.rider_info?.name || 'Pasajero' }
                  })}
                >
                  <Ionicons name="chatbubble" size={22} color="#007AFF" />
                </TouchableOpacity>
              </View>
            </View>
          )}
          
          <View style={styles.locationInfo}>
            <View style={styles.locationRow}>
              <View style={[styles.locationDot, styles.pickupDot]} />
              <Text style={styles.locationText} numberOfLines={1}>
                {currentRide.pickup_location.address || 'Recogida'}
              </Text>
            </View>
            <View style={styles.locationRow}>
              <View style={[styles.locationDot, styles.dropoffDot]} />
              <Text style={styles.locationText} numberOfLines={1}>
                {currentRide.dropoff_location.address || 'Destino'}
              </Text>
            </View>
          </View>
          
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Tarifa</Text>
            <Text style={styles.fareAmount}>${currentRide.fare?.toFixed(2)}</Text>
          </View>
          
          <View style={styles.actionButtons}>
            {currentRide.status === 'accepted' && currentRide.pickup_location && (
              <TouchableOpacity
                style={styles.navBtn}
                onPress={() => {
                  const lat = currentRide.pickup_location.latitude;
                  const lng = currentRide.pickup_location.longitude;
                  const url = Platform.OS === 'web'
                    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
                    : Platform.OS === 'ios'
                      ? `maps://app?daddr=${lat},${lng}&dirflg=d`
                      : `google.navigation:q=${lat},${lng}`;
                  Linking.openURL(url);
                }}
              >
                <Ionicons name="navigate" size={20} color="#fff" />
                <Text style={styles.navBtnText}>Navegar al origen</Text>
              </TouchableOpacity>
            )}
            {currentRide.status === 'started' && currentRide.dropoff_location && (
              <TouchableOpacity
                style={styles.navBtn}
                onPress={() => {
                  const lat = currentRide.dropoff_location.latitude;
                  const lng = currentRide.dropoff_location.longitude;
                  const url = Platform.OS === 'web'
                    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
                    : Platform.OS === 'ios'
                      ? `maps://app?daddr=${lat},${lng}&dirflg=d`
                      : `google.navigation:q=${lat},${lng}`;
                  Linking.openURL(url);
                }}
              >
                <Ionicons name="navigate" size={20} color="#fff" />
                <Text style={styles.navBtnText}>Navegar al destino</Text>
              </TouchableOpacity>
            )}

            {currentRide.status === 'accepted' && (
              <Button title="He llegado" onPress={() => handleUpdateRideStatus('arrived')} variant="secondary" />
            )}
            {currentRide.status === 'arrived' && (
              <Button title="Iniciar viaje" onPress={() => handleUpdateRideStatus('started')} variant="secondary" />
            )}
            {currentRide.status === 'started' && (
              <Button title="Completar viaje" onPress={() => handleUpdateRideStatus('completed')} variant="secondary" />
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ==================== MAIN DRIVER VIEW ====================
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hola, {user?.name?.split(' ')[0] || 'Conductor'}</Text>
          <Text style={styles.subGreeting}>
            {isOnline ? 'Esperando solicitudes de viaje...' : 'Conéctate para empezar a ganar'}
          </Text>
        </View>
        <View style={styles.onlineToggle}>
          <Text style={[styles.onlineLabel, isOnline && styles.onlineLabelActive]}>
            {isOnline ? 'En línea' : 'Desconectado'}
          </Text>
          <Switch
            value={isOnline}
            onValueChange={handleToggleOnline}
            trackColor={{ false: '#E5E5EA', true: '#6BBF00' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Status message */}
      {statusMessage ? (
        <View style={styles.statusBar}>
          <Ionicons name="information-circle" size={18} color="#007AFF" />
          <Text style={styles.statusText}>{statusMessage}</Text>
          <TouchableOpacity onPress={() => setStatusMessage('')}>
            <Ionicons name="close" size={18} color="#8E8E93" />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Map */}
      <View style={styles.mapContainer}>
        <MapView
          initialRegion={userLocation}
          markers={userLocation ? [{ ...userLocation, title: 'Tu ubicación', type: 'driver' }] : []}
        />
      </View>

      {/* Online status panel */}
      {isOnline && (
        <View style={styles.waitingPanel}>
          <View style={styles.waitingPulse}>
            <View style={styles.pulseOuter} />
            <View style={styles.pulseInner}>
              <Ionicons name="radio" size={24} color="#6BBF00" />
            </View>
          </View>
          <Text style={styles.waitingTitle}>Buscando viajes</Text>
          <Text style={styles.waitingSubtitle}>
            Recibirás solicitudes automáticas de pasajeros cercanos
          </Text>
        </View>
      )}

      {/* ==================== RIDE OFFER POPUP ==================== */}
      <Modal
        visible={!!rideOffer}
        animationType="slide"
        transparent={true}
        onRequestClose={() => handleRejectOffer(false)}
      >
        <View style={styles.offerOverlay}>
          <View style={styles.offerCard}>
            {/* Countdown progress bar */}
            <Animated.View
              style={[
                styles.countdownBar,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                  backgroundColor: countdown <= 3 ? '#FF3B30' : '#6BBF00',
                },
              ]}
            />

            {/* Header */}
            <View style={styles.offerHeader}>
              <View style={styles.offerTimerCircle}>
                <Text style={[
                  styles.offerTimerText,
                  countdown <= 3 && { color: '#FF3B30' }
                ]}>
                  {countdown}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={styles.offerTitle}>¡Nuevo viaje!</Text>
                <Text style={styles.offerSubtitle}>
                  {rideOffer ? `${nameMap[rideOffer.vehicle_type] || rideOffer.vehicle_type}` : ''}
                  {' · '}
                  {rideOffer ? `${rideOffer.rider_name}` : ''}
                </Text>
              </View>
              <Text style={styles.offerEmoji}>
                {rideOffer ? (emojiMap[rideOffer.vehicle_type] || '🚗') : '🚗'}
              </Text>
            </View>

            {/* Trip details */}
            {rideOffer && (
              <View style={styles.offerDetails}>
                <View style={styles.offerDetailRow}>
                  <View style={[styles.offerDot, { backgroundColor: '#34C759' }]} />
                  <Text style={styles.offerDetailText} numberOfLines={1}>
                    {rideOffer.pickup?.address || 'Punto de recogida'}
                  </Text>
                </View>
                <View style={styles.offerDetailDivider} />
                <View style={styles.offerDetailRow}>
                  <View style={[styles.offerDot, { backgroundColor: '#FF3B30' }]} />
                  <Text style={styles.offerDetailText} numberOfLines={1}>
                    {rideOffer.dropoff?.address || 'Destino'}
                  </Text>
                </View>

                <View style={styles.offerStats}>
                  <View style={styles.offerStatItem}>
                    <Ionicons name="cash-outline" size={20} color="#6BBF00" />
                    <Text style={styles.offerStatValue}>
                      ${Math.round(rideOffer.fare).toLocaleString()}
                    </Text>
                    <Text style={styles.offerStatLabel}>Tarifa</Text>
                  </View>
                  <View style={styles.offerStatDivider} />
                  <View style={styles.offerStatItem}>
                    <Ionicons name="navigate-outline" size={20} color="#007AFF" />
                    <Text style={styles.offerStatValue}>
                      {rideOffer.distance_km.toFixed(1)} km
                    </Text>
                    <Text style={styles.offerStatLabel}>Distancia</Text>
                  </View>
                  <View style={styles.offerStatDivider} />
                  <View style={styles.offerStatItem}>
                    <Ionicons name="time-outline" size={20} color="#FF9500" />
                    <Text style={styles.offerStatValue}>
                      {rideOffer.duration_min} min
                    </Text>
                    <Text style={styles.offerStatLabel}>Duración</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Action buttons */}
            <View style={styles.offerActions}>
              <TouchableOpacity
                style={styles.rejectBtn}
                onPress={() => handleRejectOffer(false)}
                disabled={isResponding}
              >
                <Ionicons name="close" size={28} color="#FF3B30" />
                <Text style={styles.rejectBtnText}>Rechazar</Text>
              </TouchableOpacity>

              <Animated.View style={{ flex: 1, transform: [{ scale: pulseAnim }] }}>
                <TouchableOpacity
                  style={[styles.acceptBtn, isResponding && { opacity: 0.6 }]}
                  onPress={handleAcceptOffer}
                  disabled={isResponding}
                >
                  <Ionicons name="checkmark" size={28} color="#fff" />
                  <Text style={styles.acceptBtnText}>Aceptar</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ==================== INLINE CONFIRMATIONS ==================== */}
      {confirmOnline && (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Ionicons name="power" size={40} color="#6BBF00" />
            <Text style={styles.confirmTitle}>¿Conectarse?</Text>
            <Text style={styles.confirmDesc}>Comenzarás a recibir solicitudes de viaje automáticamente</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancel} onPress={() => setConfirmOnline(false)}>
                <Text style={styles.confirmCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmOk} onPress={confirmGoOnline}>
                <Text style={styles.confirmOkText}>Conectar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {confirmOffline && (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Ionicons name="power" size={40} color="#FF3B30" />
            <Text style={styles.confirmTitle}>¿Desconectarse?</Text>
            <Text style={styles.confirmDesc}>Dejarás de recibir solicitudes de viaje</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancel} onPress={() => setConfirmOffline(false)}>
                <Text style={styles.confirmCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmOk, { backgroundColor: '#FF3B30' }]} onPress={confirmGoOffline}>
                <Text style={styles.confirmOkText}>Desconectar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  subGreeting: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
  },
  onlineToggle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  onlineLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
    marginRight: 8,
  },
  onlineLabelActive: {
    color: '#6BBF00',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  statusText: {
    flex: 1,
    fontSize: 13,
    color: '#1C1C1E',
  },
  mapContainer: {
    flex: 1,
    margin: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  // Waiting panel
  waitingPanel: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  waitingPulse: {
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  pulseOuter: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(107, 191, 0, 0.15)',
  },
  pulseInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F0FFF0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  waitingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  waitingSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 4,
  },
  // Offer popup
  offerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  offerCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 0,
    paddingHorizontal: 20,
    paddingBottom: 36,
    overflow: 'hidden',
  },
  countdownBar: {
    height: 5,
    borderRadius: 3,
  },
  offerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 16,
  },
  offerTimerCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#6BBF00',
  },
  offerTimerText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#1C1C1E',
  },
  offerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  offerSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 2,
  },
  offerEmoji: {
    fontSize: 36,
  },
  offerDetails: {
    backgroundColor: '#F8F8FA',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  offerDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  offerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  offerDetailText: {
    flex: 1,
    fontSize: 14,
    color: '#1C1C1E',
  },
  offerDetailDivider: {
    width: 1,
    height: 16,
    backgroundColor: '#E5E5EA',
    marginLeft: 4,
    marginVertical: 2,
  },
  offerStats: {
    flexDirection: 'row',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  offerStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  offerStatValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
    marginTop: 4,
  },
  offerStatLabel: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
  },
  offerStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E5EA',
    alignSelf: 'center',
  },
  offerActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  rejectBtn: {
    width: 80,
    height: 64,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FF3B30',
    marginTop: 2,
  },
  acceptBtn: {
    flex: 1,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#6BBF00',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  acceptBtnText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  // Active ride panel
  activeRidePanel: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  rideStatusBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'center',
    marginBottom: 20,
  },
  rideStatusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6BBF00',
  },
  riderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  riderAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  riderDetails: {
    flex: 1,
    marginLeft: 12,
  },
  riderName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  ratingText: {
    fontSize: 13,
    color: '#1C1C1E',
    marginLeft: 4,
  },
  riderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButtonSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationInfo: {
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  locationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  pickupDot: {
    backgroundColor: '#6BBF00',
  },
  dropoffDot: {
    backgroundColor: '#FF3B30',
  },
  locationText: {
    flex: 1,
    fontSize: 14,
    color: '#1C1C1E',
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  fareLabel: {
    fontSize: 16,
    color: '#8E8E93',
  },
  fareAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  actionButtons: { gap: 10 },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 4,
  },
  navBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  // Inline confirmations
  confirmOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  confirmCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    width: '85%',
    alignItems: 'center',
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
    marginTop: 12,
  },
  confirmDesc: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  confirmActions: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 12,
  },
  confirmCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    alignItems: 'center',
  },
  confirmCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8E8E93',
  },
  confirmOk: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#6BBF00',
    alignItems: 'center',
  },
  confirmOkText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
