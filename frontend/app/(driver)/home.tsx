import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
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
import SideMenu from '@/src/components/SideMenu';
import BannerPopup from '@/src/components/BannerPopup';
import { useAuthStore } from '@/src/stores/authStore';
import { useRideStore } from '@/src/stores/rideStore';
import { socketService } from '@/src/services/socket';
import { apiService } from '@/src/services/api';
import { getCurrentLocation, reverseGeocode } from '@/src/utils/location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';

import DriverBlockedModal from '@/src/components/DriverBlockedModal';
import CancelRideModal from '@/src/components/CancelRideModal';

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
  const goButtonScale = useRef(new Animated.Value(1)).current;
  const goButtonGlow = useRef(new Animated.Value(0)).current;
  const onlinePulse = useRef(new Animated.Value(0)).current;
  const soundRef = useRef<Audio.Sound | null>(null);
  const rideOfferRef = useRef<RideOffer | null>(null);
  const isRespondingRef = useRef(false);
  const [isToggling, setIsToggling] = useState(false);

  // Inline confirm for disconnect only
  const [confirmOffline, setConfirmOffline] = useState(false);
  const [sideMenuOpen, setSideMenuOpen] = useState(false);

  // Block & Cancel state
  const [driverBlocked, setDriverBlocked] = useState(false);
  const [blockInfo, setBlockInfo] = useState<any>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelConfig, setCancelConfig] = useState<any>(null);
  const [driverCancelCount, setDriverCancelCount] = useState(0);

  useEffect(() => {
    // Check if tutorial has been completed
    const checkTutorial = async () => {
      const completed = await AsyncStorage.getItem('tutorial_completed');
      if (!completed) {
        router.replace('/(driver)/tutorial');
        return;
      }
    };
    checkTutorial();
    
    initializeLocation();
    
    // Restore online state + active ride on mount
    const restore = async () => {
      setIsLoadingRide(true);
      try {
        // Check for active ride first
        const ride = await fetchActiveRide();
        if (ride && ['accepted', 'arrived', 'started'].includes(ride.status)) {
          setIsOnline(true);
          await AsyncStorage.setItem('driver_online', 'true');
        } else {
          // Restore saved online state
          const savedOnline = await AsyncStorage.getItem('driver_online');
          if (savedOnline === 'true') {
            // Re-register as online on backend
            const loc = await getCurrentLocation();
            if (loc) setUserLocation(loc);
            try {
              await apiService.put(
                `/drivers/availability?is_online=true${loc ? `&latitude=${loc.latitude}&longitude=${loc.longitude}` : ''}`
              );
              setIsOnline(true);
            } catch (e) {
              // If backend fails, stay offline
              await AsyncStorage.setItem('driver_online', 'false');
            }
          }
        }
      } catch (e) {
        // ignore
      } finally {
        setIsLoadingRide(false);
      }
    };
    restore();
    
    // Check block status and load cancel config
    const checkBlockAndConfig = async () => {
      try {
        const [blockRes, configRes, walletRes] = await Promise.all([
          apiService.get('/driver/block-status'),
          apiService.get('/cancellation/config'),
          apiService.get('/wallet/status'),
        ]);
        if (blockRes.is_blocked) {
          setDriverBlocked(true);
          setBlockInfo(blockRes);
        }
        setCancelConfig(configRes);
        if (walletRes.cancel_count_30d !== undefined) {
          setDriverCancelCount(walletRes.cancel_count_30d);
        }
      } catch (e) { /* silent */ }
    };
    checkBlockAndConfig();
    
    return () => {
      if (locationInterval.current) clearInterval(locationInterval.current);
      if (countdownInterval.current) clearInterval(countdownInterval.current);
      stopSound();
    };
  }, []);

  // GO button breathing animation when offline
  useEffect(() => {
    if (!isOnline && !isLoadingRide) {
      const breathe = Animated.loop(
        Animated.sequence([
          Animated.timing(goButtonScale, { toValue: 1.06, duration: 1200, useNativeDriver: true }),
          Animated.timing(goButtonScale, { toValue: 1, duration: 1200, useNativeDriver: true }),
        ])
      );
      const glow = Animated.loop(
        Animated.sequence([
          Animated.timing(goButtonGlow, { toValue: 1, duration: 1200, useNativeDriver: false }),
          Animated.timing(goButtonGlow, { toValue: 0, duration: 1200, useNativeDriver: false }),
        ])
      );
      breathe.start();
      glow.start();
      return () => { breathe.stop(); glow.stop(); };
    } else {
      goButtonScale.setValue(1);
      goButtonGlow.setValue(0);
    }
  }, [isOnline, isLoadingRide]);

  // Online pulse ring animation
  useEffect(() => {
    if (isOnline && !currentRide) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(onlinePulse, { toValue: 1, duration: 2000, useNativeDriver: false }),
          Animated.timing(onlinePulse, { toValue: 0, duration: 0, useNativeDriver: false }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [isOnline, currentRide]);

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

      // Listen for ride status updates to properly reset state
      const unsubStatus = socketService.on('ride_status_update', (data: any) => {
        console.log('Ride status update:', data);
        if (data.status === 'completed' || data.status === 'cancelled') {
          // Ride ended - clean up and go back to waiting
          fetchActiveRide();
        }
      });
      
      // Rider cancelled → driver gets notified with compensation
      const unsubRiderCancel = socketService.on('ride_cancelled_by_rider', (data: any) => {
        console.log('Rider cancelled:', data);
        const comp = data.compensation || 0;
        if (comp > 0) {
          setStatusMessage(`El pasajero canceló. Recibiste $${comp} de compensación.`);
        } else {
          setStatusMessage('El pasajero canceló el viaje.');
        }
        fetchActiveRide();
      });
      
      startLocationUpdates();

      // Health check: ensure WebSocket stays alive + poll for active ride
      const healthCheck = setInterval(() => {
        if (isOnline && user) {
          // Force reconnect if socket died
          if (!socketService.isConnected) {
            console.log('Health check: Socket dead, forcing reconnect');
            socketService.forceReconnect();
          }
        }
      }, 15000);
      
      return () => {
        unsubOffer();
        unsubExpired();
        unsubAccepted();
        unsubStatus();
        unsubRiderCancel();
        clearInterval(healthCheck);
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
    
    const offerCountdown = data.countdown || COUNTDOWN_SECONDS;
    rideOfferRef.current = data;
    isRespondingRef.current = false;
    setRideOffer(data);
    setCountdown(offerCountdown);
    
    triggerVibration();
    playAlertSound();
    
    progressAnim.setValue(1);
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: offerCountdown * 1000,
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
    if (isToggling) return;
    if (value) {
      // Directly go online (Uber style - no confirmation needed)
      setIsToggling(true);
      try {
        const loc = userLocation;
        await apiService.put(
          `/drivers/availability?is_online=true${loc ? `&latitude=${loc.latitude}&longitude=${loc.longitude}` : ''}`
        );
        setIsOnline(true);
        await AsyncStorage.setItem('driver_online', 'true');
        setStatusMessage('¡Estás en línea! Esperando solicitudes...');
        // Haptic feedback
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch(e) {}
      } catch (error: any) {
        setStatusMessage(error.message || 'No se pudo conectar');
      } finally {
        setIsToggling(false);
      }
    } else {
      setConfirmOffline(true);
    }
  };

  const confirmGoOffline = async () => {
    setConfirmOffline(false);
    setIsToggling(true);
    try {
      await apiService.put(
        `/drivers/availability?is_online=false${userLocation ? `&latitude=${userLocation.latitude}&longitude=${userLocation.longitude}` : ''}`
      );
      setIsOnline(false);
      await AsyncStorage.setItem('driver_online', 'false');
      setStatusMessage('Estás desconectado');
      socketService.disconnect();
    } catch (error: any) {
      setStatusMessage(error.message || 'Error al desconectar');
    } finally {
      setIsToggling(false);
    }
  };

  // Payment confirmation modal
  const [showPaymentConfirm, setShowPaymentConfirm] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  const handleUpdateRideStatus = async (status: string) => {
    if (!currentRide) return;
    
    // For completion: show payment confirmation first
    if (status === 'completed') {
      setShowPaymentConfirm(true);
      return;
    }
    
    try {
      await updateRideStatus(currentRide.ride_id, status);
    } catch (error: any) {
      setStatusMessage(error.message || 'Error al actualizar estado');
    }
  };

  const handleConfirmPayment = async () => {
    if (!currentRide) return;
    setPaymentConfirmed(true);
    try {
      const response = await updateRideStatus(currentRide.ride_id, 'completed');
      setShowPaymentConfirm(false);
      setPaymentConfirmed(false);
      let msg = `¡Viaje completado! Ganaste $${currentRide.driver_earnings?.toFixed(0) || currentRide.fare?.toFixed(0)}`;
      if (response?.penalty_surcharge) {
        msg += ` (incluye $${response.penalty_surcharge} en multas del pasajero)`;
      }
      setStatusMessage(msg);
      fetchActiveRide();
    } catch (error: any) {
      setStatusMessage(error.message || 'Error al completar viaje');
      setPaymentConfirmed(false);
    }
  };

  const handleCancelRide = async () => {
    if (!currentRide) return;
    try {
      const response = await updateRideStatus(currentRide.ride_id, 'cancelled');
      setShowCancelModal(false);
      
      if (response?.penalty?.penalty_applied) {
        const p = response.penalty;
        if (p.blocked) {
          // Driver got blocked
          setDriverBlocked(true);
          setBlockInfo({
            is_blocked: true,
            reason: p.block_reason || 'cancellations',
            message: p.message,
            balance: user?.wallet_balance || 0,
            blocked_until: p.blocked_until,
          });
        }
        setStatusMessage(p.message);
        // Update cancel count
        setDriverCancelCount(prev => prev + 1);
      } else {
        setStatusMessage('Viaje cancelado sin cargo.');
      }
      fetchActiveRide();
    } catch (error: any) {
      setStatusMessage(error.message || 'Error al cancelar');
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
          <ActivityIndicator size="large" color="#A855F7" />
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
                <Ionicons name="person" size={24} color="#A855F7" />
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
                  <Ionicons name="call" size={22} color="#A855F7" />
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
              <Button title="Finalizar viaje" onPress={() => handleUpdateRideStatus('completed')} variant="secondary" />
            )}

            {/* Cancel ride button - only before trip starts */}
            {(currentRide.status === 'accepted' || currentRide.status === 'arrived') && (
              <TouchableOpacity style={styles.cancelRideBtn} onPress={() => setShowCancelModal(true)}>
                <Ionicons name="close-circle-outline" size={18} color="#FF3B30" />
                <Text style={styles.cancelRideText}>Cancelar viaje</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        
        {/* Cancel Ride Modal */}
        <CancelRideModal
          visible={showCancelModal}
          onClose={() => setShowCancelModal(false)}
          onConfirmCancel={handleCancelRide}
          userType="driver"
          rideAcceptedAt={currentRide.accepted_at || currentRide.created_at}
          cancelConfig={cancelConfig}
          driverCancelCount={driverCancelCount}
        />
        
        {/* Driver Blocked Modal */}
        <DriverBlockedModal
          visible={driverBlocked}
          reason={blockInfo?.reason || 'negative_balance'}
          message={blockInfo?.message || 'Tu cuenta ha sido bloqueada.'}
          balance={blockInfo?.balance ?? user?.wallet_balance ?? 0}
          blockedUntil={blockInfo?.blocked_until || null}
          onChatSupport={() => {
            setDriverBlocked(false);
            // Open support bubble by navigating
          }}
          onRechargeWallet={() => {
            setDriverBlocked(false);
            router.push('/(driver)/earnings');
          }}
        />
        
        {/* Payment Confirmation Modal */}
        <Modal visible={showPaymentConfirm} transparent animationType="slide" onRequestClose={() => setShowPaymentConfirm(false)}>
          <View style={styles.paymentOverlay}>
            <View style={styles.paymentCard}>
              <View style={styles.paymentHeader}>
                <Ionicons name="cash" size={48} color="#A855F7" />
                <Text style={styles.paymentTitle}>Cobrar al pasajero</Text>
              </View>
              
              <View style={styles.paymentAmountBox}>
                <Text style={styles.paymentAmountLabel}>Monto a cobrar</Text>
                <Text style={styles.paymentAmount}>${currentRide.fare?.toFixed(0)}</Text>
                <Text style={styles.paymentMethod}>
                  {currentRide.payment_method === 'card' ? '💳 Pago con tarjeta' : '💵 Pago en efectivo'}
                </Text>
              </View>
              
              <View style={styles.paymentDetails}>
                <View style={styles.paymentRow}>
                  <Text style={styles.paymentDetailLabel}>Distancia</Text>
                  <Text style={styles.paymentDetailVal}>{currentRide.distance?.toFixed(1)} km</Text>
                </View>
                <View style={styles.paymentRow}>
                  <Text style={styles.paymentDetailLabel}>Tu ganancia</Text>
                  <Text style={[styles.paymentDetailVal, { color: '#A855F7', fontWeight: '800' }]}>
                    ${currentRide.driver_earnings?.toFixed(0) || currentRide.fare?.toFixed(0)}
                  </Text>
                </View>
              </View>

              {currentRide.payment_method === 'card' ? (
                <TouchableOpacity
                  style={styles.paymentConfirmBtn}
                  onPress={handleConfirmPayment}
                  disabled={paymentConfirmed}
                >
                  {paymentConfirmed ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.paymentConfirmText}>Confirmar fin de viaje</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.paymentConfirmBtn}
                  onPress={handleConfirmPayment}
                  disabled={paymentConfirmed}
                >
                  {paymentConfirmed ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.paymentConfirmText}>Confirmar pago recibido</Text>
                  )}
                </TouchableOpacity>
              )}
              
              <TouchableOpacity style={styles.paymentCancelBtn} onPress={() => setShowPaymentConfirm(false)}>
                <Text style={styles.paymentCancelText}>Volver</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // ==================== MAIN DRIVER VIEW ====================
  return (
    <SafeAreaView style={styles.container}>
      {/* Full-screen Map */}
      <View style={styles.fullMap}>
        <MapView
          initialRegion={userLocation}
          markers={userLocation ? [{ ...userLocation, title: 'Tu ubicación', type: 'driver' }] : []}
        />
      </View>

      {/* Floating Header */}
      <View style={styles.floatingHeader}>
        <View style={styles.floatingHeaderInner}>
          <TouchableOpacity style={styles.hamburgerBtn} onPress={() => setSideMenuOpen(true)}>
            <Ionicons name="menu" size={24} color="#1C1C1E" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.greeting}>Hola, {user?.name?.split(' ')[0] || 'Conductor'}</Text>
            <Text style={styles.subGreeting}>
              {isOnline ? 'Esperando solicitudes...' : 'Toca GO para conectarte'}
            </Text>
          </View>
          <View style={[styles.statusChip, isOnline ? styles.statusChipOnline : styles.statusChipOffline]}>
            <View style={[styles.statusDotSmall, isOnline ? styles.statusDotOnline : styles.statusDotOff]} />
            <Text style={[styles.statusChipText, isOnline && styles.statusChipTextOnline]}>
              {isOnline ? 'En línea' : 'Desconectado'}
            </Text>
          </View>
        </View>
      </View>

      {/* Status message */}
      {statusMessage ? (
        <View style={styles.floatingStatusBar}>
          <Ionicons name="information-circle" size={18} color="#007AFF" />
          <Text style={styles.statusText}>{statusMessage}</Text>
          <TouchableOpacity onPress={() => setStatusMessage('')}>
            <Ionicons name="close" size={18} color="#8E8E93" />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* === OFFLINE: Central GO Button === */}
      {!isOnline && (
        <View style={styles.goButtonContainer} pointerEvents="box-none">
          <Animated.View style={[styles.goButtonGlowRing, {
            opacity: goButtonGlow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.5] }),
            transform: [{ scale: goButtonGlow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) }],
          }]} />
          <Animated.View style={{ transform: [{ scale: goButtonScale }] }}>
            <TouchableOpacity
              style={styles.goButton}
              onPress={() => handleToggleOnline(true)}
              activeOpacity={0.8}
              disabled={isToggling}
            >
              {isToggling ? (
                <ActivityIndicator size="large" color="#fff" />
              ) : (
                <Text style={styles.goButtonText}>GO</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
          <Text style={styles.goButtonHint}>Toca para conectarte</Text>
        </View>
      )}

      {/* === ONLINE: Bottom Panel with Searching + Disconnect === */}
      {isOnline && (
        <View style={styles.onlineBottomPanel}>
          <View style={styles.onlinePanelContent}>
            {/* Pulse ring indicator */}
            <View style={styles.onlinePulseContainer}>
              <Animated.View style={[styles.onlinePulseRing, {
                opacity: onlinePulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 0, 0] }),
                transform: [{ scale: onlinePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.5] }) }],
              }]} />
              <View style={styles.onlineIconCircle}>
                <Ionicons name="radio" size={22} color="#fff" />
              </View>
            </View>
            <View style={styles.onlineTextBlock}>
              <Text style={styles.onlineTitle}>Buscando viajes</Text>
              <Text style={styles.onlineSubtitle}>Recibirás solicitudes automáticamente</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.disconnectBtn}
            onPress={() => handleToggleOnline(false)}
            disabled={isToggling}
          >
            {isToggling ? (
              <ActivityIndicator size="small" color="#FF3B30" />
            ) : (
              <>
                <Ionicons name="power" size={18} color="#FF3B30" />
                <Text style={styles.disconnectBtnText}>Desconectar</Text>
              </>
            )}
          </TouchableOpacity>
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
                  backgroundColor: countdown <= 3 ? '#FF3B30' : '#A855F7',
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
                    <Ionicons name="cash-outline" size={20} color="#A855F7" />
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

      {/* ==================== DISCONNECT CONFIRMATION ==================== */}
      <Modal visible={confirmOffline} transparent animationType="fade" onRequestClose={() => setConfirmOffline(false)}>
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
      </Modal>
      <SideMenu visible={sideMenuOpen} onClose={() => setSideMenuOpen(false)} role="driver" />
      <BannerPopup target="driver" enabled={isOnline && !currentRide} intervalMs={120000} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  hamburgerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Full-screen map
  fullMap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  // Floating header
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingTop: Platform.OS === 'ios' ? 54 : 40,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  floatingHeaderInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greeting: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  subGreeting: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusChipOnline: {
    backgroundColor: '#E8F5E9',
  },
  statusChipOffline: {
    backgroundColor: '#F2F2F7',
  },
  statusDotSmall: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusDotOnline: {
    backgroundColor: '#A855F7',
  },
  statusDotOff: {
    backgroundColor: '#C7C7CC',
  },
  statusChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
  },
  statusChipTextOnline: {
    color: '#A855F7',
  },
  // Floating status bar
  floatingStatusBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 110 : 96,
    left: 20,
    right: 20,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(227,242,253,0.95)',
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
  // GO Button (offline)
  goButtonContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  goButtonGlowRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#A855F7',
  },
  goButton: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: '#A855F7',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 16,
  },
  goButtonText: {
    fontSize: 48,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 2,
  },
  goButtonHint: {
    marginTop: 20,
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  // Online bottom panel
  onlineBottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  onlinePanelContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  onlinePulseContainer: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  onlinePulseRing: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#A855F7',
  },
  onlineIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#A855F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  onlineTextBlock: {
    flex: 1,
  },
  onlineTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  onlineSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#FF3B30',
    backgroundColor: '#FFF5F5',
  },
  disconnectBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FF3B30',
  },
  // Map container for active ride view
  mapContainer: {
    flex: 1,
    margin: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  // Payment confirmation modal
  paymentOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  paymentCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
  },
  paymentHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  paymentTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C1C1E',
    marginTop: 12,
  },
  paymentAmountBox: {
    backgroundColor: '#F8F8FA',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  paymentAmountLabel: {
    fontSize: 14,
    color: '#8E8E93',
  },
  paymentAmount: {
    fontSize: 48,
    fontWeight: '900',
    color: '#1C1C1E',
    marginVertical: 4,
  },
  paymentMethod: {
    fontSize: 14,
    color: '#A855F7',
    fontWeight: '600',
  },
  paymentDetails: {
    marginBottom: 20,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  paymentDetailLabel: {
    fontSize: 15,
    color: '#8E8E93',
  },
  paymentDetailVal: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  paymentConfirmBtn: {
    backgroundColor: '#A855F7',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  paymentConfirmText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  paymentCancelBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  paymentCancelText: {
    fontSize: 15,
    color: '#8E8E93',
    fontWeight: '600',
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
    borderColor: '#A855F7',
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
    backgroundColor: '#A855F7',
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
    color: '#A855F7',
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
    backgroundColor: '#A855F7',
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
    backgroundColor: '#A855F7',
    alignItems: 'center',
  },
  confirmOkText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  cancelRideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#FF3B30',
  },
  cancelRideText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF3B30',
  },
});
