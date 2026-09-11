import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Animated,
  Easing,
  Vibration,
  Image,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MapView } from '@/src/components/MapView';
import { useAuthStore } from '@/src/stores/authStore';
import { useRideStore } from '@/src/stores/rideStore';
import { socketService } from '@/src/services/socket';
import SnakeGame from '@/src/components/SnakeGame';
import { apiService } from '@/src/services/api';
import { Audio } from 'expo-av';
import SideMenu from '@/src/components/SideMenu';
import CampaignInterstitial from '@/src/components/CampaignInterstitial';
import CancelRideModal from '@/src/components/CancelRideModal';
import VehicleIcon, { VehicleKind } from '@/src/components/VehicleIcon';
import {
  getCurrentLocation,
  reverseGeocode,
  searchPlaces,
  estimateDriving,
  LocationCoords,
  PlaceResult,
} from '@/src/utils/location';

const { width: SW, height: SH } = Dimensions.get('window');

type Phase = 'idle' | 'destination' | 'confirm' | 'searching' | 'active' | 'completed';

export default function RiderHomeScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const params = useLocalSearchParams<{ service?: string }>();
  const { currentRequest, currentRide, bids, createRideRequest, acceptBid, fetchActiveRide, fetchActiveRequest, addBid, clearRequest, updateRideStatus } = useRideStore();

  // Core state
  const [phase, setPhase] = useState<Phase>('idle');
  const [userLocation, setUserLocation] = useState<LocationCoords | null>(null);
  const [pickupLocation, setPickupLocation] = useState<LocationCoords | null>(null);
  const [dropoffLocation, setDropoffLocation] = useState<LocationCoords | null>(null);
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [stops, setStops] = useState<Array<{ location: LocationCoords; address: string }>>([]);
  const [selectedVehicle, setSelectedVehicle] = useState('economy');
  const [fareEstimates, setFareEstimates] = useState<any[]>([]);
  const [routeInfo, setRouteInfo] = useState<{ distance_km: number; duration_min: number } | null>(null);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelConfig, setCancelConfig] = useState<any>(null);
  const [searchModal, setSearchModal] = useState(false);
  const [searchType, setSearchType] = useState<'pickup' | 'dropoff' | 'stop'>('dropoff');
  const [editingStopIndex, setEditingStopIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Dispatch
  const [dispatchMsg, setDispatchMsg] = useState('');
  const [dispatchProgress, setDispatchProgress] = useState<{ i: number; t: number } | null>(null);
  const [driverFound, setDriverFound] = useState(false);
  const [showContinuePrompt, setShowContinuePrompt] = useState(false);
  const [rideRating, setRideRating] = useState(0);
  const [firstRideDiscount, setFirstRideDiscount] = useState(0);
  const [addressHistory, setAddressHistory] = useState<any[]>([]);
  const [serviceType, setServiceType] = useState<'ride' | 'delivery'>(params.service === 'delivery' ? 'delivery' : 'ride');
  const [deliveryDirection, setDeliveryDirection] = useState<'send' | 'receive'>('send');
  const [showSnake, setShowSnake] = useState(false);
  const [vehicleIcons, setVehicleIcons] = useState<Record<string, any>>({});

  // Banners
  const [banners, setBanners] = useState<any[]>([]);

  // Refs to prevent loops
  const estimateFetched = useRef(false);
  const lastRideStatus = useRef<string>('');
  const searchHeartbeat = useRef(new Animated.Value(1)).current;
  const searchRadar = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (phase !== 'searching' || driverFound || showContinuePrompt) {
      searchHeartbeat.stopAnimation();
      searchRadar.stopAnimation();
      searchHeartbeat.setValue(1);
      searchRadar.setValue(0);
      return;
    }
    const heartbeatLoop = Animated.loop(Animated.sequence([
      Animated.timing(searchHeartbeat, { toValue: 1.12, duration: 340, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(searchHeartbeat, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.delay(420),
    ]));
    const radarLoop = Animated.loop(Animated.timing(searchRadar, { toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    heartbeatLoop.start();
    radarLoop.start();
    return () => { heartbeatLoop.stop(); radarLoop.stop(); };
  }, [phase, driverFound, showContinuePrompt, searchHeartbeat, searchRadar]);

  // ─── Sounds ───────────────────────────────
  const playSound = async (type: 'accepted' | 'arrived' | 'completed') => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
      });
      const urls: Record<string, string> = {
        accepted: 'https://actions.google.com/sounds/v1/alerts/notification_simple-01.ogg',
        arrived: 'https://actions.google.com/sounds/v1/alerts/notification_simple-02.ogg',
        completed: 'https://actions.google.com/sounds/v1/alerts/notification_high-intensity.ogg',
      };
      const { sound } = await Audio.Sound.createAsync(
        { uri: urls[type] },
        { shouldPlay: true, volume: 1.0 }
      );
      // Auto-unload after playing
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) {
          sound.unloadAsync();
        }
      });
    } catch (e) {
      // Sound is non-critical, ignore errors
    }
  };

  // ─── Init ─────────────────────────────────
  useEffect(() => {
    initLocation();
    fetchActiveRide().then(async (ride) => {
      if (ride && ['accepted', 'arrived', 'started'].includes(ride.status)) {
        setPhase('active');
      } else {
        const request = await fetchActiveRequest();
        if (request) setPhase('searching');
      }
    });
    fetchBanners();
    // Load cancellation config
    apiService.get('/cancellation/config').then(setCancelConfig).catch(() => {});
    // Load first ride discount
    apiService.get('/promotions/first-ride').then((r) => {
      if (r.eligible && r.discount_percent > 0) setFirstRideDiscount(r.discount_percent);
    }).catch(() => {});
    // Load address history
    apiService.get('/places/history').then((r) => {
      if (r.history) setAddressHistory(r.history);
    }).catch(() => {});
    // Load banner interval from settings
    fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/admin/settings/public`)
      .then(r => r.json())
      .then(d => {
      }).catch(() => {});
    // Load vehicle icons from admin
    fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/vehicle-icons`)
      .then(r => r.json())
      .then(d => {
        if (d.icons) {
          const map: Record<string, any> = {};
          d.icons.forEach((ic: any) => { map[ic.vehicle_type] = ic; });
          setVehicleIcons(map);
        }
      }).catch(() => {});
  }, []);

  // Detect active ride → switch phase
  useEffect(() => {
    if (currentRide && ['accepted', 'arrived', 'started'].includes(currentRide.status)) {
      setPhase('active');
    }
  }, [currentRide]);

  // ─── POLLING: Active ride status updates ──
  useEffect(() => {
    if (phase !== 'active') return;
    
    const pollInterval = setInterval(async () => {
      try {
        const ride = await fetchActiveRide();
        if (!ride) {
          setPhase('idle');
          clearInterval(pollInterval);
          return;
        }
        
        // Detect status transitions and play sounds
        const newStatus = ride.status;
        const prevStatus = lastRideStatus.current;
        
        if (newStatus !== prevStatus) {
          lastRideStatus.current = newStatus;
          
          if (newStatus === 'accepted' && prevStatus !== 'accepted') {
            playSound('accepted');
            Vibration.vibrate([0, 300, 200, 300]);
          } else if (newStatus === 'arrived' && prevStatus !== 'arrived') {
            playSound('arrived');
            Vibration.vibrate([0, 500, 200, 500]);
          } else if (newStatus === 'completed') {
            playSound('completed');
            Vibration.vibrate([0, 300, 150, 300, 150, 300]);
            setPhase('completed');
            clearInterval(pollInterval);
            // No auto-dismiss - let user rate first
            return;
          } else if (newStatus === 'cancelled') {
            showError('El viaje fue cancelado');
            handleFinishRide();
            clearInterval(pollInterval);
            return;
          }
        }
      } catch (e) {
        // silently retry
      }
    }, 4000);

    return () => clearInterval(pollInterval);
  }, [phase]);

  // ─── WebSocket ────────────────────────────
  useEffect(() => {
    if (!user) return;
    socketService.connect(user.user_id);

    const unsub1 = socketService.on('new_bid', (d: any) => { if (d.bid) addBid(d.bid); });
    const unsub2 = socketService.on('searching_driver', (d: any) => {
      setDispatchMsg(`Buscando conductor ${d.driver_index}/${d.total_drivers}...`);
      setDispatchProgress({ i: d.driver_index, t: d.total_drivers });
    });
    const unsubReviewing = socketService.on('driver_reviewing', (d: any) => {
      setDispatchMsg(d.message || `${d.driver_name || 'Un conductor'} está viendo tu viaje`);
    });
    const unsubReviewEnded = socketService.on('driver_review_ended', (d: any) => {
      setDispatchMsg(d.message || 'Buscando otro conductor...');
    });
    const unsub3 = socketService.on('ride_accepted', () => {
      setDriverFound(true);
      setDispatchMsg('¡Conductor encontrado!');
      playSound('accepted');
      Vibration.vibrate([0, 300, 200, 300]);
      setTimeout(() => {
        fetchActiveRide();
        setPhase('active');
        lastRideStatus.current = 'accepted';
        resetDispatch();
      }, 1500);
    });
    const unsub4 = socketService.on('no_drivers_available', () => {
      setDispatchMsg('No hay conductores disponibles');
      setTimeout(() => {
        setPhase('confirm');
        resetDispatch();
        clearRequest();
      }, 3000);
    });
    const unsub5 = socketService.on('search_taking_long', () => {
      setShowContinuePrompt(true);
      setDispatchMsg('Está tardando más de lo normal...');
      playSound('arrived');
      Vibration.vibrate([0, 300, 200, 300]);
    });

    // Driver cancelled → auto re-dispatch
    const unsub6 = socketService.on('driver_cancelled_redispatching', (d: any) => {
      setPhase('searching');
      setDispatchMsg(d.message || 'Tu conductor canceló. Buscando otro...');
      setDriverFound(false);
      playSound('arrived');
      Vibration.vibrate([0, 400, 200, 400]);
      fetchActiveRide();
    });
    
    const unsub7 = socketService.on('redispatch_failed', (d: any) => {
      setErrorMsg(d.message || 'No se encontró otro conductor.');
      setPhase('idle');
      resetDispatch();
      clearRequest();
    });

    // Ride completed via WebSocket - immediate rating
    const unsub8 = socketService.on('ride_completed', () => {
      playSound('completed');
      Vibration.vibrate([0, 300, 150, 300, 150, 300]);
      fetchActiveRide();
      setPhase('completed');
    });
    const unsub9 = socketService.on('ride_status_update', (d: any) => {
      if (d.status === 'completed') {
        playSound('completed');
        Vibration.vibrate([0, 300, 150, 300, 150, 300]);
        fetchActiveRide();
        setPhase('completed');
      } else if (d.status === 'arrived') {
        playSound('arrived');
        Vibration.vibrate([0, 500, 200, 500]);
        fetchActiveRide();
      }
    });

    return () => { unsub1(); unsub2(); unsubReviewing(); unsubReviewEnded(); unsub3(); unsub4(); unsub5(); unsub6(); unsub7(); unsub8(); unsub9(); };
  }, [user]);

  // ─── Polling fallback when searching ──────
  useEffect(() => {
    if (phase !== 'searching') return;
    
    // Fallback timer: if after 60 seconds no WebSocket alert, show prompt
    const fallbackTimer = setTimeout(() => {
      if (!driverFound && !showContinuePrompt) {
        setShowContinuePrompt(true);
        setDispatchMsg('Está tardando más de lo normal...');
      }
    }, 60000);
    
    const pollInterval = setInterval(async () => {
      try {
        const ride = await fetchActiveRide();
        if (ride && ['accepted', 'arrived', 'started'].includes(ride.status)) {
          setDriverFound(true);
          setDispatchMsg('¡Conductor encontrado!');
          playSound('accepted');
          Vibration.vibrate([0, 300, 200, 300]);
          lastRideStatus.current = ride.status;
          setTimeout(() => {
            setPhase('active');
            resetDispatch();
          }, 1200);
          clearInterval(pollInterval);
        }
      } catch (e) {
        // Silently retry
      }
    }, 3000);

    return () => { clearInterval(pollInterval); clearTimeout(fallbackTimer); };
  }, [phase]);

  // ─── Search debounce ──────────────────────
  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    setIsSearching(true);
    const t = setTimeout(async () => {
      const results = await searchPlaces(searchQuery, userLocation || undefined);
      setSearchResults(results);
      setIsSearching(false);
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // ─── Helpers ──────────────────────────────
  const initLocation = async () => {
    const loc = await getCurrentLocation();
    if (loc) {
      setUserLocation(loc);
      setPickupLocation(loc);
      const addr = await reverseGeocode(loc.latitude, loc.longitude);
      setPickupAddress(addr);
    }
  };

  const resetDispatch = () => {
    setDispatchMsg('');
    setDispatchProgress(null);
    setDriverFound(false);
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 4000);
  };

  const fetchBanners = async () => {
    try {
      const url = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const r = await fetch(`${url}/api/banners`);
      const d = await r.json();
      if (d.banners) setBanners(d.banners);
    } catch (e) { /* ignore */ }
  };

  const fetchEstimates = async (dist: number, dur: number) => {
    try {
      const url = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const r = await fetch(`${url}/api/rides/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distance_km: dist, duration_min: dur }),
      });
      const d = await r.json();
      if (d.estimates) {
        setFareEstimates(d.estimates);
        if (d.estimates.length > 0 && !d.estimates.find((e: any) => e.vehicle_type === selectedVehicle)) {
          setSelectedVehicle(d.estimates[0].vehicle_type);
        }
      }
    } catch (e) { /* ignore */ }
  };

  // ─── Location select ──────────────────────
  
  // Handle marker drag (pin adjustment)
  const handleMarkerDrag = async (markerType: string, coords: { latitude: number; longitude: number }) => {
    const addr = await reverseGeocode(coords.latitude, coords.longitude);
    if (markerType === 'pickup') {
      const newPickup = { ...coords, address: addr };
      setPickupLocation(newPickup);
      setPickupAddress(addr);
      if (dropoffLocation) {
        recalcEstimates(newPickup, dropoffLocation, stops);
      }
    } else if (markerType === 'dropoff') {
      const newDropoff = { ...coords, address: addr };
      setDropoffLocation(newDropoff);
      setDropoffAddress(addr);
      if (pickupLocation) {
        recalcEstimates(pickupLocation, newDropoff, stops);
      }
    }
  };

  const recalcEstimates = (pickup: LocationCoords, dropoff: LocationCoords, currentStops: Array<{ location: LocationCoords; address: string }>) => {
    // Calculate total distance through all waypoints
    let totalDist = 0;
    const allPoints = [pickup, ...currentStops.map(s => s.location), dropoff];
    for (let i = 0; i < allPoints.length - 1; i++) {
      totalDist += estimateDriving(allPoints[i], allPoints[i + 1]).distance_km;
    }
    const totalMin = Math.max(5, Math.round((totalDist / 30) * 60));
    const est = { distance_km: totalDist, duration_min: totalMin };
    setRouteInfo(est);
    fetchEstimates(est.distance_km, est.duration_min);
    estimateFetched.current = true;
    setPhase('confirm');
  };

  const handleSelectPlace = async (place: PlaceResult) => {
    estimateFetched.current = false;
    const loc = { latitude: place.latitude, longitude: place.longitude, address: place.address };
    
    if (searchType === 'pickup') {
      setPickupLocation(loc);
      setPickupAddress(place.name);
      if (dropoffLocation) {
        recalcEstimates(loc, dropoffLocation, stops);
      }
    } else if (searchType === 'stop') {
      const newStops = [...stops];
      if (editingStopIndex >= 0 && editingStopIndex < newStops.length) {
        newStops[editingStopIndex] = { location: loc, address: place.name };
      } else {
        newStops.push({ location: loc, address: place.name });
      }
      setStops(newStops);
      if (pickupLocation && dropoffLocation) {
        recalcEstimates(pickupLocation, dropoffLocation, newStops);
      }
    } else {
      setDropoffLocation(loc);
      setDropoffAddress(place.name);
      if (pickupLocation) {
        recalcEstimates(pickupLocation, loc, stops);
      }
    }
    setSearchModal(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleMapPress = async (coords: { latitude: number; longitude: number }) => {
    const addr = await reverseGeocode(coords.latitude, coords.longitude);
    if (!dropoffLocation) {
      setDropoffLocation({ ...coords, address: addr });
      setDropoffAddress(addr);
      if (pickupLocation) {
        const est = estimateDriving(pickupLocation, coords);
        setRouteInfo(est);
        fetchEstimates(est.distance_km, est.duration_min);
        setPhase('confirm');
      }
    }
  };

  // ─── Request ride ─────────────────────────
  const handleRequestRide = async () => {
    if (!pickupLocation || !dropoffLocation) {
      showError('Selecciona origen y destino');
      return;
    }
    setIsLoading(true);
    try {
      const requestData: any = {
        pickup_location: { latitude: pickupLocation.latitude, longitude: pickupLocation.longitude, address: pickupAddress },
        dropoff_location: { latitude: dropoffLocation.latitude, longitude: dropoffLocation.longitude, address: dropoffAddress },
        vehicle_type: selectedVehicle,
        ride_type: 'standard',
        payment_method: 'cash',
        service_type: serviceType, // 'ride' or 'delivery'
      };
      if (stops.length > 0) {
        requestData.stops = stops.map(s => ({
          latitude: s.location.latitude,
          longitude: s.location.longitude,
          address: s.address,
        }));
      }
      await createRideRequest(requestData);
      setPhase('searching');
    } catch (e: any) {
      showError(e.message || 'Error al solicitar viaje');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelSearch = async () => {
    // Cancel the search on backend
    try {
      if (currentRequest?.request_id) {
        const url = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        const token = useAuthStore.getState().token;
        await fetch(`${url}/api/rides/request/${currentRequest.request_id}/cancel`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        });
      }
    } catch (e) { /* ignore */ }
    clearRequest();
    resetDispatch();
    setShowContinuePrompt(false);
    setPhase('confirm');
  };

  const handleContinueSearch = () => {
    setShowContinuePrompt(false);
    setDispatchMsg('Seguimos buscando conductor...');
  };

  const handleBackToIdle = () => {
    setDropoffLocation(null);
    setDropoffAddress('');
    setRouteInfo(null);
    setFareEstimates([]);
    estimateFetched.current = false;
    clearRequest();
    setPhase('idle');
  };

  const chooseDeliveryDirection = (direction: 'send' | 'receive') => {
    setDeliveryDirection(direction); setServiceType('delivery'); setRouteInfo(null); setFareEstimates([]); estimateFetched.current=false;
    if (direction === 'receive') {
      setPickupLocation(null); setPickupAddress('');
      if (userLocation) { setDropoffLocation(userLocation); setDropoffAddress('Mi ubicación actual'); }
    } else {
      if (userLocation) { setPickupLocation(userLocation); setPickupAddress('Mi ubicación actual'); }
      setDropoffLocation(null); setDropoffAddress('');
    }
    setPhase('idle');
  };

  const handleMinimizeSearch = () => {
    router.replace('/modules');
  };

  // ─── Memoized markers (prevents re-render loop) ───
  const markers = useMemo(() => {
    const m: any[] = [];
    const isDraggable = phase === 'confirm' || phase === 'idle';
    if (pickupLocation) m.push({ latitude: pickupLocation.latitude, longitude: pickupLocation.longitude, title: 'Recogida', type: 'pickup' as const, draggable: isDraggable });
    if (dropoffLocation) m.push({ latitude: dropoffLocation.latitude, longitude: dropoffLocation.longitude, title: 'Destino', type: 'dropoff' as const, draggable: phase === 'confirm' });
    if (currentRide?.driver_location) m.push({ latitude: currentRide.driver_location.latitude, longitude: currentRide.driver_location.longitude, title: 'Conductor', type: 'driver' as const });
    if (phase === 'idle' && !currentRide) {
      const center = pickupLocation || userLocation || { latitude: -28.4696, longitude: -65.7852 };
      m.push(
        { latitude: center.latitude + 0.0024, longitude: center.longitude - 0.0021, title: 'Moto cerca', type: 'driver' as const, vehicleType: 'moto', preview: true },
        { latitude: center.latitude - 0.0028, longitude: center.longitude + 0.0019, title: 'Auto cerca', type: 'driver' as const, vehicleType: 'economy', preview: true },
        { latitude: center.latitude + 0.0011, longitude: center.longitude + 0.0033, title: 'Moto cerca', type: 'driver' as const, vehicleType: 'moto', preview: true },
        { latitude: center.latitude - 0.0016, longitude: center.longitude - 0.0031, title: 'Auto cerca', type: 'driver' as const, vehicleType: 'economy', preview: true },
      );
    }
    return m;
  }, [pickupLocation?.latitude, pickupLocation?.longitude, dropoffLocation?.latitude, dropoffLocation?.longitude, currentRide?.driver_location?.latitude, currentRide, phase, userLocation?.latitude, userLocation?.longitude]);

  const nameMap: Record<string, string> = { economy: 'Auto', moto: 'Moto', comfort: 'Confort', premium: 'Premium', xl: 'XL' };
  const selectedFare = fareEstimates.find((e: any) => e.vehicle_type === selectedVehicle);

  const handleFinishRide = () => {
    clearRequest();
    setDropoffLocation(null);
    setDropoffAddress('');
    setRouteInfo(null);
    setFareEstimates([]);
    estimateFetched.current = false;
    setPhase('idle');
  };

  // ═══════════════════════════════════════════
  // PHASE: COMPLETED RIDE
  // ═══════════════════════════════════════════
  if (phase === 'completed' && currentRide) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.completedContainer}>
          <View style={s.completedIcon}>
            <Ionicons name="checkmark-circle" size={72} color="#00C853" />
          </View>
          <Text style={s.completedTitle}>¡Viaje completado!</Text>
          <Text style={s.completedSubtitle}>Gracias por viajar con Moli</Text>

          <View style={s.completedCard}>
            <View style={s.completedRow}>
              <Text style={s.completedLabel}>Tarifa total</Text>
              <Text style={s.completedFare}>${currentRide.fare?.toFixed(0)}</Text>
            </View>
            {(currentRide.penalty_surcharge ?? 0) > 0 && (
              <>
                <View style={s.completedDivider} />
                <View style={s.completedRow}>
                  <Text style={[s.completedLabel, { color: '#FF9500' }]}>Multa(s) incluida(s)</Text>
                  <Text style={[s.completedValue, { color: '#FF9500', fontWeight: '700' }]}>${currentRide.penalty_surcharge?.toFixed(0)}</Text>
                </View>
              </>
            )}
            <View style={s.completedDivider} />
            {currentRide.driver_info && (
              <View style={s.completedRow}>
                <Text style={s.completedLabel}>Conductor</Text>
                <Text style={s.completedValue}>{currentRide.driver_info.name}</Text>
              </View>
            )}
            <View style={s.completedRow}>
              <Text style={s.completedLabel}>Método de pago</Text>
              <Text style={s.completedValue}>Efectivo</Text>
            </View>
          </View>

          {/* Star Rating */}
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#1C1C1E', marginTop: 20, marginBottom: 10 }}>
            ¿Cómo fue tu experiencia?
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity key={star} onPress={() => setRideRating(star)}>
                <Ionicons
                  name={star <= rideRating ? 'star' : 'star-outline'}
                  size={40}
                  color={star <= rideRating ? '#FFD700' : '#D1D1D6'}
                />
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={s.completedBtn} onPress={async () => {
            // Submit rating
            if (rideRating > 0 && currentRide.ride_id) {
              try {
                await apiService.post(`/rides/${currentRide.ride_id}/rate`, {
                  rating: rideRating,
                  rated_user_type: 'driver',
                });
              } catch (e) { /* silent */ }
            }
            setRideRating(0);
            handleFinishRide();
          }}>
            <Text style={s.completedBtnText}>
              {rideRating > 0 ? 'Calificar y volver' : 'Volver al inicio'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════
  // PHASE: ACTIVE RIDE
  // ═══════════════════════════════════════════
  if (phase === 'active' && currentRide) {
    const statusLabels: Record<string, string> = {
      accepted: 'Tu conductor está en camino',
      arrived: 'Tu conductor ha llegado',
      started: 'Viaje en curso',
      completed: '¡Viaje completado!',
    };
    return (
      <SafeAreaView style={s.container}>
        <View style={s.mapFull}>
          <MapView initialRegion={pickupLocation || undefined} markers={markers} showRoute={true} />
        </View>
        <View style={s.activeCard}>
          {/* Status badge */}
          <View style={s.activeStatusBadge}>
            <View style={[s.statusDot, currentRide.status === 'arrived' ? { backgroundColor: '#FF9500' } : currentRide.status === 'started' ? { backgroundColor: '#007AFF' } : { backgroundColor: '#34C759' }]} />
            <Text style={s.activeStatusText}>{statusLabels[currentRide.status] || currentRide.status}</Text>
          </View>

          {/* Plate number - BIG and prominent */}
          {currentRide.vehicle_info?.plate_number && (
            <View style={{ alignItems: 'center', marginVertical: 10 }}>
              <View style={{ backgroundColor: '#1C1C1E', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 8 }}>
                <Text style={{ fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: 2 }}>{currentRide.vehicle_info.plate_number}</Text>
              </View>
              {currentRide.vehicle_info && (
                <Text style={{ fontSize: 13, color: '#8E8E93', marginTop: 6 }}>
                  {currentRide.vehicle_info.color} {currentRide.vehicle_info.make} {currentRide.vehicle_info.model}
                </Text>
              )}
            </View>
          )}

          {/* Driver info row - Didi style */}
          {currentRide.driver_info && (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F8FA', borderRadius: 16, padding: 14, marginBottom: 12 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#00C853', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                <Text style={{ fontSize: 24, fontWeight: '800', color: '#fff' }}>
                  {(currentRide.driver_info.name || 'C').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#1C1C1E' }}>{currentRide.driver_info.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <Ionicons name="star" size={14} color="#FFD700" />
                  <Text style={{ fontSize: 13, color: '#8E8E93', fontWeight: '600' }}>{(currentRide.driver_info.rating || 5).toFixed(1)}</Text>
                  <Text style={{ fontSize: 11, color: '#C7C7CC', marginLeft: 4 }}>{currentRide.driver_info.total_rides || 0} viajes</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity 
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' }}
                  onPress={() => router.push({ pathname: '/chat', params: { rideId: currentRide.ride_id, otherName: currentRide.driver_info?.name || 'Conductor' } })}
                >
                  <Ionicons name="chatbubble-ellipses" size={20} color="#00C853" />
                </TouchableOpacity>
                {currentRide.driver_info.phone && (
                  <TouchableOpacity 
                    style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center' }}
                    onPress={() => Linking.openURL(`tel:${currentRide.driver_info.phone}`)}
                  >
                    <Ionicons name="call" size={20} color="#007AFF" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* Fare and ride info */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F0F0F0' }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: 0.5 }}>Tarifa</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#00C853', marginTop: 2 }}>${currentRide.fare?.toFixed(0)}</Text>
            </View>
            {currentRide.estimated_distance && (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 11, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: 0.5 }}>Distancia</Text>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#1C1C1E', marginTop: 2 }}>{currentRide.estimated_distance.toFixed(1)} km</Text>
              </View>
            )}
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: '#8E8E93', textTransform: 'uppercase', letterSpacing: 0.5 }}>Pago</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#1C1C1E', marginTop: 4 }}>
                {currentRide.payment_method === 'cash' ? '💵 Efectivo' : currentRide.payment_method === 'wallet' ? '💳 Billetera' : '💳 Tarjeta'}
              </Text>
            </View>
          </View>

          {/* Safety actions */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <TouchableOpacity 
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F2F2F7' }}
              onPress={() => {
                const msg = `Estoy en un viaje con ${currentRide.driver_info?.name || 'un conductor'}. Patente: ${currentRide.vehicle_info?.plate_number || 'N/A'}. ${currentRide.vehicle_info?.color || ''} ${currentRide.vehicle_info?.make || ''} ${currentRide.vehicle_info?.model || ''}`;
                Linking.openURL(`sms:?body=${encodeURIComponent(msg)}`);
              }}
            >
              <Ionicons name="share-outline" size={16} color="#007AFF" />
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#007AFF' }}>Compartir viaje</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#FFF5F5' }}
              onPress={() => Linking.openURL('tel:911')}
            >
              <Ionicons name="shield-outline" size={16} color="#FF3B30" />
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#FF3B30' }}>Emergencia</Text>
            </TouchableOpacity>
          </View>
          
          {/* Cancel ride - only before trip starts */}
          {(currentRide.status === 'accepted' || currentRide.status === 'arrived') && (
            <TouchableOpacity style={[s.cancelActiveBtn, { marginTop: 10 }]} onPress={() => setShowCancelModal(true)}>
              <Ionicons name="close-circle-outline" size={18} color="#FF3B30" />
              <Text style={s.cancelActiveText}>Cancelar viaje</Text>
            </TouchableOpacity>
          )}
        </View>
        
        {/* Cancel Ride Modal */}
        <CancelRideModal
          visible={showCancelModal}
          onClose={() => setShowCancelModal(false)}
          onConfirmCancel={async (reason, redispatch) => {
            try {
              const response = await updateRideStatus(currentRide.ride_id, 'cancelled', { cancel_reason: reason, redispatch });
              setShowCancelModal(false);
              if (response?.penalty?.penalty_applied) {
                setErrorMsg(response.penalty.message);
              }
              setPhase(redispatch ? 'searching' : 'idle');
              if (redispatch) await fetchActiveRequest();
              else fetchActiveRide();
            } catch (e: any) {
              setErrorMsg(e.message || 'Error al cancelar');
            }
          }}
          userType="rider"
          rideAcceptedAt={currentRide.accepted_at || currentRide.created_at}
          cancelConfig={cancelConfig}
        />
      </SafeAreaView>
    );
  }

  // ═══════════════════════════════════════════
  // MAIN RIDER VIEW
  // ═══════════════════════════════════════════
  return (
    <SafeAreaView style={s.container}>
      {/* Error banner */}
      {errorMsg ? (
        <View style={s.errorBanner}>
          <Ionicons name="alert-circle" size={16} color="#FF3B30" />
          <Text style={s.errorText}>{errorMsg}</Text>
          <TouchableOpacity onPress={() => setErrorMsg('')}><Ionicons name="close" size={16} color="#999" /></TouchableOpacity>
        </View>
      ) : null}

      {/* Map */}
      <View style={s.mapFull}>
        <MapView
          initialRegion={userLocation || undefined}
          markers={markers}
          showRoute={!!pickupLocation && !!dropoffLocation}
          onMapPress={phase === 'idle' ? handleMapPress : undefined}
          onMarkerDrag={phase === 'confirm' || phase === 'idle' ? handleMarkerDrag : undefined}
        />

        {/* Drag hint */}
        {phase === 'confirm' && (
          <View style={s.dragHint}>
            <Ionicons name="move-outline" size={14} color="#fff" />
            <Text style={s.dragHintText}>Arrastra los puntos para ajustar</Text>
          </View>
        )}

        {/* Hamburger menu button */}
        {(phase === 'idle' || phase === 'confirm') && !currentRide && (
          <TouchableOpacity style={s.hamburgerBtn} onPress={() => setSideMenuOpen(true)}>
            <Ionicons name="menu" size={26} color="#1C1C1E" />
          </TouchableOpacity>
        )}

        {phase === 'idle' && !currentRide && (
          <View style={s.mapBrand}>
            <Text style={s.mapBrandMoli}>moli</Text><View style={s.mapBrandDivider} /><Text style={s.mapBrandMode}>VIAJES</Text>
          </View>
        )}

        {phase === 'idle' && !currentRide && (
          <View style={s.nearbyMapChip}><View style={s.liveDot} /><Text style={s.nearbyMapText}>Vehículos cerca</Text></View>
        )}

        {/* Back button when confirming */}
        {(phase === 'confirm' || phase === 'searching') && (
          <TouchableOpacity style={s.mapBackBtn} onPress={phase === 'searching' ? handleMinimizeSearch : handleBackToIdle}>
            <Ionicons name={phase === 'searching' ? 'contract-outline' : 'arrow-back'} size={24} color="#1C1C1E" />
          </TouchableOpacity>
        )}
        {phase === 'searching' && (
          <View style={s.searchingMapChip}>
            <Ionicons name="radio-outline" size={17} color="#FF5A1F" />
            <Text style={s.searchingMapChipText}>Buscando cerca tuyo</Text>
          </View>
        )}
      </View>

      {/* ═══ Bottom Panel ═══ */}
      {phase === 'idle' && (
        <View style={s.bottomPanel}>
          <View style={s.panelHandle} />
          {/* Header with greeting */}
          <View style={s.rideHeader}>
            <View>
              <Text style={s.rideEyebrow}>{serviceType === 'delivery' ? 'MOLI ENVÍOS' : 'MOLI VIAJES'}</Text>
              <Text style={s.rideTitle}>{serviceType === 'delivery' ? (deliveryDirection === 'send' ? '¿A dónde lo enviamos?' : '¿Dónde lo retiramos?') : '¿A dónde vamos?'}</Text>
            </View>
            <TouchableOpacity style={s.supportBtn} onPress={() => router.push('/support' as any)}>
              <Ionicons name="headset" size={20} color="#FF5A1F" />
            </TouchableOpacity>
          </View>

          {/* Search bar */}
          <TouchableOpacity style={s.searchBar} onPress={() => { setSearchType(serviceType === 'delivery' && deliveryDirection === 'receive' ? 'pickup' : 'dropoff'); setSearchModal(true); }}>
            <Text style={s.searchPlaceholder}>{serviceType === 'delivery' && deliveryDirection === 'receive' ? 'Buscá el punto de retiro' : 'Buscá tu destino'}</Text>
            <View style={s.searchIcon}><Ionicons name="search" size={22} color="#fff" /></View>
          </TouchableOpacity>

          {/* Origin row */}
          <TouchableOpacity style={s.originRow} onPress={() => { setSearchType('pickup'); setSearchModal(true); }}>
            <View style={s.originIcon}><Ionicons name="navigate" size={16} color="#FF5A1F" /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.originLabel}>{serviceType === 'delivery' ? 'PUNTO DE RETIRO' : 'SALÍS DESDE'}</Text>
              <Text style={s.originText} numberOfLines={1}>{pickupAddress || (deliveryDirection === 'receive' ? 'Elegí dónde retirar' : 'Tu ubicación actual')}</Text>
            </View>
            <TouchableOpacity onPress={initLocation} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="locate" size={20} color="#FF5A1F" />
            </TouchableOpacity>
          </TouchableOpacity>

          <View style={s.nearbySummary}>
            <View style={s.vehiclePreviewStack}>
              <View style={s.vehiclePreviewBubble}><Image source={require('../../assets/vehicles/map-car-moli.png')} style={s.vehiclePreviewImage} /></View>
              <View style={[s.vehiclePreviewBubble, s.vehiclePreviewOverlap]}><Image source={require('../../assets/vehicles/map-moto-moli.png')} style={s.vehiclePreviewImage} /></View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.nearbyTitle}>Autos y motos cerca</Text>
              <Text style={s.nearbyCaption}>Posiciones orientativas hasta confirmar el viaje</Text>
            </View>
            <View style={s.nearbyCount}><Text style={s.nearbyCountText}>4</Text></View>
          </View>

          {/* Quick actions: Viaje / Envíos */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <TouchableOpacity
              style={[s.serviceCard, serviceType === 'ride' && s.serviceCardActive]}
              onPress={() => setServiceType('ride')}
            >
              <View style={s.serviceIconWrap}>
                <Image source={require('../../assets/vehicles/map-car-moli.png')} style={s.serviceVehicleImage} />
              </View>
              <View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1C1C1E' }}>Viaje</Text>
                <Text style={{ fontSize: 11, color: '#8E8E93' }}>Ir a algún lugar</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.serviceCard, serviceType === 'delivery' && s.serviceCardActive]}
              onPress={() => chooseDeliveryDirection('send')}
            >
              <View style={s.serviceIconWrap}>
                <Image source={require('../../assets/vehicles/map-moto-moli.png')} style={s.serviceVehicleImage} />
              </View>
              <View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1C1C1E' }}>Envíos</Text>
                <Text style={{ fontSize: 11, color: '#8E8E93' }}>Mandar paquetes</Text>
              </View>
            </TouchableOpacity>
          </View>
          {serviceType === 'delivery' && <View style={s.deliveryModeWrap}>
            <TouchableOpacity style={[s.deliveryMode,deliveryDirection==='send'&&s.deliveryModeActive]} onPress={()=>chooseDeliveryDirection('send')}><Ionicons name="paper-plane" size={17} color={deliveryDirection==='send'?'#fff':'#FF5A1F'}/><View><Text style={[s.deliveryModeTitle,deliveryDirection==='send'&&s.deliveryModeTitleActive]}>Enviar</Text><Text style={[s.deliveryModeText,deliveryDirection==='send'&&s.deliveryModeTextActive]}>Sale desde donde estás</Text></View></TouchableOpacity>
            <TouchableOpacity style={[s.deliveryMode,deliveryDirection==='receive'&&s.deliveryModeActive]} onPress={()=>chooseDeliveryDirection('receive')}><Ionicons name="download" size={17} color={deliveryDirection==='receive'?'#fff':'#FF5A1F'}/><View><Text style={[s.deliveryModeTitle,deliveryDirection==='receive'&&s.deliveryModeTitleActive]}>Recibir</Text><Text style={[s.deliveryModeText,deliveryDirection==='receive'&&s.deliveryModeTextActive]}>Llega hasta donde estás</Text></View></TouchableOpacity>
          </View>}

          {/* Suggestions: Casa, Trabajo, Aeropuerto */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            {[
              { icon: 'home', label: 'Casa', color: '#FF5A1F' },
              { icon: 'briefcase', label: 'Trabajo', color: '#FF8A3D' },
              { icon: 'airplane', label: 'Aeropuerto', color: '#E9480B' },
            ].map((sug, i) => (
              <TouchableOpacity
                key={i}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: '#F8F8FA' }}
                onPress={() => { setSearchType('dropoff'); setSearchModal(true); }}
              >
                <Ionicons name={sug.icon as any} size={20} color={sug.color} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#1C1C1E', marginTop: 4 }}>{sug.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Recent addresses */}
          {addressHistory.length > 0 && (
            <View style={{ marginTop: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#8E8E93', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Recientes</Text>
              {addressHistory.slice(0, 3).map((h, i) => (
                <TouchableOpacity
                  key={i}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: '#F0F0F0', gap: 10 }}
                  onPress={() => {
                    if (h.location) {
                      setDropoffLocation({ latitude: h.location.latitude, longitude: h.location.longitude });
                      setDropoffAddress(h.address);
                      setPhase('confirm');
                    }
                  }}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name={h.type === 'saved' ? 'bookmark' : 'time-outline'} size={16} color={h.type === 'saved' ? '#00C853' : '#8E8E93'} />
                  </View>
                  <Text style={{ flex: 1, fontSize: 14, color: '#1C1C1E' }} numberOfLines={1}>{h.address || 'Dirección'}</Text>
                  <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Banners carousel */}
          {banners.length > 0 && (
            <View style={{ marginTop: 14 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}>
                {banners.map((b: any, i: number) => (
                  <TouchableOpacity
                    key={b.banner_id || i}
                    style={{ width: 220, marginHorizontal: 4, borderRadius: 14, overflow: 'hidden', backgroundColor: '#F8F8FA' }}
                    onPress={() => b.button_link ? Linking.openURL(b.button_link) : null}
                    activeOpacity={0.8}
                  >
                    {b.image_url ? (
                      <Image source={{ uri: b.image_url }} style={{ width: 220, height: 100, borderTopLeftRadius: 14, borderTopRightRadius: 14 }} resizeMode="cover" />
                    ) : (
                      <View style={{ width: 220, height: 60, backgroundColor: '#00C853', borderTopLeftRadius: 14, borderTopRightRadius: 14, justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="megaphone" size={24} color="#fff" />
                      </View>
                    )}
                    <View style={{ padding: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#1C1C1E' }} numberOfLines={1}>{b.title || 'Novedad'}</Text>
                      {b.description ? <Text style={{ fontSize: 11, color: '#8E8E93', marginTop: 2 }} numberOfLines={2}>{b.description}</Text> : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      )}

      {phase === 'confirm' && (
        <View style={s.confirmPanel}>
          {/* Route summary - editable with stops */}
          <View style={s.routeSummary}>
            <View style={s.routeDots}>
              <View style={[s.dot, { backgroundColor: '#34C759' }]} />
              {stops.map((_, i) => (
                <React.Fragment key={`dot-${i}`}>
                  <View style={s.dotLine} />
                  <View style={[s.dot, { backgroundColor: '#007AFF' }]} />
                </React.Fragment>
              ))}
              <View style={s.dotLine} />
              <View style={[s.dot, { backgroundColor: '#FF3B30' }]} />
            </View>
            <View style={{ flex: 1 }}>
              {/* Pickup */}
              <TouchableOpacity onPress={() => { setSearchType('pickup'); setSearchModal(true); }} style={s.editableAddr}>
                <Text style={s.routeAddr} numberOfLines={1}>{pickupAddress || 'Origen'}</Text>
                <Ionicons name="pencil" size={14} color="#8E8E93" />
              </TouchableOpacity>
              
              {/* Intermediate stops */}
              {stops.map((stop, i) => (
                <View key={`stop-${i}`} style={s.stopRow}>
                  <TouchableOpacity
                    onPress={() => { setSearchType('stop'); setEditingStopIndex(i); setSearchModal(true); }}
                    style={[s.editableAddr, { flex: 1 }]}
                  >
                    <Text style={s.stopAddr} numberOfLines={1}>{stop.address}</Text>
                    <Ionicons name="pencil" size={12} color="#8E8E93" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      const newStops = stops.filter((_, idx) => idx !== i);
                      setStops(newStops);
                      if (pickupLocation && dropoffLocation) recalcEstimates(pickupLocation, dropoffLocation, newStops);
                    }}
                    style={s.removeStopBtn}
                  >
                    <Ionicons name="close-circle" size={20} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              ))}
              
              {/* Add stop button */}
              {stops.length < 4 && (
                <TouchableOpacity
                  onPress={() => { setSearchType('stop'); setEditingStopIndex(-1); setSearchModal(true); }}
                  style={s.addStopBtn}
                >
                  <Ionicons name="add-circle-outline" size={18} color="#007AFF" />
                  <Text style={s.addStopText}>Agregar parada</Text>
                </TouchableOpacity>
              )}
              
              {/* Dropoff */}
              <TouchableOpacity onPress={() => { setSearchType('dropoff'); setSearchModal(true); }} style={s.editableAddr}>
                <Text style={s.routeAddr2} numberOfLines={1}>{dropoffAddress || 'Destino'}</Text>
                <Ionicons name="pencil" size={14} color="#8E8E93" />
              </TouchableOpacity>
            </View>
            {routeInfo && (
              <View style={s.routeStats}>
                <Text style={s.routeStatVal}>{routeInfo.distance_km.toFixed(1)} km</Text>
                <Text style={s.routeStatLabel}>{routeInfo.duration_min} min</Text>
              </View>
            )}
          </View>

          {/* Vehicle list */}
          <ScrollView style={s.vehicleList} showsVerticalScrollIndicator={false}>
            {(() => {
              const order = ['economy', 'moto', 'comfort', 'premium', 'xl'];
              const defaults = [
                { vehicle_type: 'economy', display_name: 'Auto', estimated_fare: 0 },
                { vehicle_type: 'moto', display_name: 'Moto', estimated_fare: 0 },
                { vehicle_type: 'comfort', display_name: 'Confort', estimated_fare: 0 },
                { vehicle_type: 'premium', display_name: 'Premium', estimated_fare: 0 },
                { vehicle_type: 'xl', display_name: 'XL', estimated_fare: 0 },
              ];
              const list = fareEstimates.length > 0 ? [...fareEstimates].sort((a, b) => order.indexOf(a.vehicle_type) - order.indexOf(b.vehicle_type)) : defaults;
              return list;
            })().map((v: any) => {
              const id = v.vehicle_type;
              const sel = selectedVehicle === id;
              const eta = routeInfo ? routeInfo.duration_min + (id === 'economy' ? 3 : id === 'comfort' ? 2 : id === 'premium' ? 1 : 5) : null;
              return (
                <TouchableOpacity key={id} style={[s.vehicleItem, sel && s.vehicleItemSel]} onPress={() => setSelectedVehicle(id)}>
                  {vehicleIcons[id]?.image_data ? (
                    <Image source={{ uri: vehicleIcons[id].image_data }} style={{ width: 36, height: 36, borderRadius: 6 }} resizeMode="contain" />
                  ) : (
                    <VehicleIcon kind={(id === 'moto' ? 'moto' : 'car') as VehicleKind} size={44} selected={sel} />
                  )}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[s.vehicleName, sel && { color: '#FF7733' }]}>{v.display_name || nameMap[id]}</Text>
                    {eta && <Text style={s.vehicleEta}>{eta} min</Text>}
                  </View>
                  <Text style={[s.vehiclePrice, sel && { color: '#FF7733' }]}>
                    {v.estimated_fare > 0 ? `$${Math.round(v.estimated_fare).toLocaleString()}` : '...'}
                  </Text>
                  {sel && <Ionicons name="checkmark-circle" size={20} color="#FF7733" style={{ marginLeft: 8 }} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Payment method */}
          <View style={s.payRow}>
            <Ionicons name="cash-outline" size={20} color="#34C759" />
            <Text style={s.payText}>Efectivo</Text>
            <Ionicons name="chevron-forward" size={16} color="#8E8E93" />
          </View>

          {/* First ride discount banner */}
          {firstRideDiscount > 0 && selectedFare && (
            <View style={{ backgroundColor: '#E8F5E9', borderRadius: 10, padding: 10, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="gift" size={20} color="#00C853" />
              <Text style={{ flex: 1, fontSize: 13, color: '#2E7D32', fontWeight: '600' }}>
                ¡{firstRideDiscount}% de descuento en tu primer viaje! Ahorrás ${Math.round(selectedFare.estimated_fare * firstRideDiscount / 100).toLocaleString()}
              </Text>
            </View>
          )}

          {/* Confirm button */}
          <TouchableOpacity
            style={[s.confirmBtn, isLoading && { opacity: 0.6 }]}
            onPress={handleRequestRide}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.confirmBtnText}>
                Confirmar {nameMap[selectedVehicle]}{selectedFare ? ` · $${Math.round(
                  firstRideDiscount > 0
                    ? selectedFare.estimated_fare * (1 - firstRideDiscount / 100)
                    : selectedFare.estimated_fare
                ).toLocaleString()}` : ''}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {phase === 'searching' && (
        <View style={s.searchingPanel}>
          {driverFound ? (
            <View style={s.foundContainer}>
              <View style={s.foundCircle}><Ionicons name="checkmark" size={40} color="#fff" /></View>
              <Text style={s.foundText}>¡Conductor encontrado!</Text>
              <Text style={s.foundSub}>Preparando tu viaje...</Text>
            </View>
          ) : showContinuePrompt ? (
            <View style={s.searchingContainer}>
              <Ionicons name="time-outline" size={48} color="#FF9500" />
              <Text style={s.searchingText}>Está tardando más de lo normal</Text>
              <Text style={s.searchingHint}>No hemos podido asignar un conductor aún. ¿Deseas seguir buscando?</Text>
              <TouchableOpacity style={s.confirmBtn} onPress={handleContinueSearch}>
                <Text style={s.confirmBtnText}>Sí, seguir buscando</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelSearchBtn} onPress={handleCancelSearch}>
                <Text style={s.cancelSearchText}>Cancelar viaje</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[s.searchingContainer, s.searchingContainerBounded]}>
              <ScrollView style={s.searchingScroll} contentContainerStyle={s.searchingScrollContent} showsVerticalScrollIndicator={false}>
              <View style={s.panelHandle} />
              <View style={s.searchRadarWrap}>
                <Animated.View style={[s.searchRadarPulse, { opacity: searchRadar.interpolate({ inputRange: [0, .75, 1], outputRange: [.4, .12, 0] }), transform: [{ scale: searchRadar.interpolate({ inputRange: [0, 1], outputRange: [.62, 1.42] }) }] }]} />
                <View style={s.searchRadarRingOuter} />
                <View style={s.searchRadarRingInner} />
                <View style={[s.radarVehicle, s.radarVehicleLeft]}><VehicleIcon kind="moto" size={38} backgroundColor="transparent" /></View>
                <View style={[s.radarVehicle, s.radarVehicleRight]}><VehicleIcon kind="car" size={40} backgroundColor="transparent" /></View>
                <Animated.View style={[s.searchMoliOrb, { transform: [{ scale: searchHeartbeat }] }]}>
                  <Text style={s.searchMoliLetter}>M</Text>
                </Animated.View>
              </View>
              <Text style={s.searchingTitle}>Buscando tu conductor</Text>
              <Text style={s.searchingSubtitle}>Estamos avisando a los más cercanos</Text>

              <View style={s.searchStatusCard}>
                <View style={s.searchAvatar}><Ionicons name="person" size={23} color="#FF5A1F" /></View>
                <View style={s.searchStatusCopy}>
                  <View style={s.searchDots}><View style={s.searchDotStrong} /><View style={s.searchDot} /><View style={s.searchDotSoft} /></View>
                  <Text style={s.searchStatusText}>{dispatchMsg && !dispatchMsg.includes('0/0') ? dispatchMsg : 'Avisando a conductores cercanos'}</Text>
                </View>
              </View>

              <View style={s.searchTripCard}>
                <VehicleIcon kind={selectedVehicle === 'moto' ? 'moto' : 'car'} size={46} color="#202124" backgroundColor="#FFF4EC" />
                <View style={{ flex: 1 }}><Text style={s.searchTripMeta}>{nameMap[selectedVehicle] || 'Auto'} · Efectivo</Text><Text style={s.searchTripPrice}>{selectedFare ? `$ ${Math.round(selectedFare.estimated_fare).toLocaleString('es-AR')}` : 'Calculando tarifa'}</Text></View>
                <Ionicons name="chevron-down" size={20} color="#6F6762" />
              </View>

              <View style={s.searchPrivacy}><Ionicons name="shield-checkmark" size={17} color="#8E8E93" /><Text style={s.searchPrivacyText}>Tu ubicación exacta se comparte solo al confirmar</Text></View>

              {/* Snake game while waiting */}
              {!showSnake ? (
                <TouchableOpacity
                  style={s.playWhileWaitingBtn}
                  onPress={() => setShowSnake(true)}
                >
                  <View style={s.playIcon}><Ionicons name="game-controller" size={24} color="#FF5A1F" /></View>
                  <Text style={s.playWhileWaitingText}>Jugá mientras esperás</Text>
                </TouchableOpacity>
              ) : (
                <SnakeGame onClose={() => setShowSnake(false)} />
              )}

              </ScrollView>
              <TouchableOpacity style={s.cancelSearchBtn} onPress={handleCancelSearch}><Text style={s.cancelSearchText}>Cancelar búsqueda</Text></TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* ═══ Search Modal ═══ */}
      <Modal visible={searchModal} animationType="slide">
        <SafeAreaView style={s.modalContainer}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => { setSearchModal(false); setSearchQuery(''); }} style={s.modalBack}>
                <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
              </TouchableOpacity>
              <Text style={s.modalTitle}>{searchType === 'pickup' ? 'Punto de recogida' : '¿A dónde vas?'}</Text>
            </View>

            <View style={s.searchInputWrap}>
              <Ionicons name="search" size={20} color="#8E8E93" />
              <TextInput
                style={s.searchInput}
                placeholder="Buscar dirección..."
                placeholderTextColor="#8E8E93"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={20} color="#C7C7CC" />
                </TouchableOpacity>
              )}
            </View>

            {isSearching && <ActivityIndicator style={{ marginTop: 20 }} color="#00C853" />}

            <ScrollView style={s.resultsList} keyboardShouldPersistTaps="handled">
              {/* Use current location option */}
              {searchType === 'pickup' && (
                <TouchableOpacity style={s.resultItem} onPress={() => { initLocation(); setSearchModal(false); }}>
                  <View style={[s.resultIcon, { backgroundColor: '#E8F5E9' }]}><Ionicons name="locate" size={20} color="#34C759" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.resultName}>Mi ubicación actual</Text>
                    <Text style={s.resultAddr}>Usar GPS</Text>
                  </View>
                </TouchableOpacity>
              )}

              {searchResults.map((place) => (
                <TouchableOpacity key={place.id} style={s.resultItem} onPress={() => handleSelectPlace(place)}>
                  <View style={s.resultIcon}><Ionicons name="location" size={20} color="#00C853" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.resultName} numberOfLines={1}>{place.name}</Text>
                    <Text style={s.resultAddr} numberOfLines={1}>{place.address}</Text>
                  </View>
                </TouchableOpacity>
              ))}

              {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
                <Text style={s.noResults}>No se encontraron resultados</Text>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
      <SideMenu visible={sideMenuOpen} onClose={() => setSideMenuOpen(false)} role="rider" />
      <CampaignInterstitial
        enabled={!!currentRide && currentRide.status === 'started'}
        trigger="ride_started"
        surface="rides"
        entityType="ride"
        entityId={currentRide?.ride_id}
      />
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  // ─── Error ────────
  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF0F0', marginHorizontal: 16, marginTop: 4, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, gap: 8 },
  errorText: { flex: 1, fontSize: 13, color: '#FF3B30', fontWeight: '500' },

  // ─── Map ──────────
  mapFull: { flex: 1 },
  mapBackBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 54 : 38, left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4, zIndex: 2 },
  searchingMapChip: { position: 'absolute', top: Platform.OS === 'ios' ? 54 : 38, left: 72, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: '#FFFDFB', borderWidth: 1, borderColor: '#FFE4D6', shadowColor: '#6D2C0D', shadowOffset: { width: 0, height: 4 }, shadowOpacity: .14, shadowRadius: 9, elevation: 5, zIndex: 2 },
  searchingMapChipText: { fontSize: 13, fontWeight: '800', color: '#282321' },
  hamburgerBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 54 : 38, left: 16, width: 46, height: 46, borderRadius: 23, backgroundColor: '#FFFDFB', justifyContent: 'center', alignItems: 'center', shadowColor: '#5A2B14', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 6, zIndex: 2, borderWidth: 1, borderColor: '#FFF0E7' },
  mapBrand: { position: 'absolute', top: Platform.OS === 'ios' ? 55 : 39, alignSelf: 'center', height: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: '#FFFDFB', flexDirection: 'row', alignItems: 'center', shadowColor: '#5A2B14', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.14, shadowRadius: 10, elevation: 5, zIndex: 2, borderWidth: 1, borderColor: '#FFF0E7' },
  mapBrandMoli: { fontSize: 21, lineHeight: 24, fontWeight: '900', color: '#FF5A1F', letterSpacing: -1 },
  mapBrandDivider: { width: 1, height: 18, backgroundColor: '#FFD8C6', marginHorizontal: 9 },
  mapBrandMode: { fontSize: 10, fontWeight: '900', color: '#24201E', letterSpacing: 1.5 },
  nearbyMapChip: { position: 'absolute', top: Platform.OS === 'ios' ? 108 : 92, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,253,251,0.95)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18, gap: 7, zIndex: 2, shadowColor: '#5A2B14', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E', borderWidth: 2, borderColor: '#DCFCE7' },
  nearbyMapText: { fontSize: 11, fontWeight: '800', color: '#3C3330' },
  dragHint: { position: 'absolute', top: Platform.OS === 'ios' ? 54 : 38, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(28,28,30,0.85)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, gap: 6, zIndex: 2 },
  dragHintText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // ─── Idle Bottom Panel ───
  bottomPanel: { backgroundColor: '#FFF9F4', borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 24, shadowColor: '#6D2C0D', shadowOffset: { width: 0, height: -7 }, shadowOpacity: 0.15, shadowRadius: 18, elevation: 12, borderTopWidth: 1, borderColor: '#FFE5D7' },
  panelHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#E7D8CF', marginBottom: 12 },
  rideHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 },
  rideEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.8, color: '#FF5A1F', marginBottom: 2 },
  rideTitle: { fontSize: 25, lineHeight: 30, fontWeight: '900', color: '#201C1A', letterSpacing: -0.6 },
  supportBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FFE3D4', shadowColor: '#7A3516', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3 },
  greeting: { fontSize: 22, fontWeight: '700', color: '#1C1C1E', marginBottom: 16 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 25, paddingLeft: 20, paddingRight: 6, paddingVertical: 6, minHeight: 58, marginBottom: 10, borderWidth: 1, borderColor: '#FFE0D0', shadowColor: '#7B3211', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.14, shadowRadius: 13, elevation: 5 },
  searchIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#FF5A1F', justifyContent: 'center', alignItems: 'center', shadowColor: '#C53A00', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 7, elevation: 4 },
  searchPlaceholder: { flex: 1, fontSize: 16, fontWeight: '600', color: '#8C817C' },
  originRow: { flexDirection: 'row', alignItems: 'center', minHeight: 54, paddingVertical: 8, paddingHorizontal: 12, gap: 11, backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#F5E9E2' },
  originIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#FFF0E8', justifyContent: 'center', alignItems: 'center' },
  originLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.1, color: '#C66A40', marginBottom: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  originText: { fontSize: 13, fontWeight: '600', color: '#2B2623' },
  nearbySummary: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: '#FFF1E9', borderWidth: 1, borderColor: '#FFDDCB' },
  vehiclePreviewStack: { width: 63, flexDirection: 'row', alignItems: 'center' },
  vehiclePreviewBubble: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFF', borderWidth: 2, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#A64010', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.16, shadowRadius: 5, elevation: 3 },
  vehiclePreviewOverlap: { marginLeft: -13 },
  vehiclePreviewImage: { width: 34, height: 34, resizeMode: 'contain' },
  nearbyTitle: { fontSize: 12, fontWeight: '800', color: '#2B2623' },
  nearbyCaption: { fontSize: 9.5, color: '#8D7770', marginTop: 1 },
  nearbyCount: { minWidth: 27, height: 27, paddingHorizontal: 7, borderRadius: 14, backgroundColor: '#FF5A1F', alignItems: 'center', justifyContent: 'center' },
  nearbyCountText: { color: '#FFF', fontSize: 12, fontWeight: '900' },
  serviceCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 10, borderRadius: 17, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#F2E8E2', shadowColor: '#7B3211', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 7, elevation: 2 },
  deliveryModeWrap:{flexDirection:'row',gap:8,marginTop:10},deliveryMode:{flex:1,minHeight:58,borderRadius:17,borderWidth:1.5,borderColor:'#FFD5C2',backgroundColor:'#FFF',flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:12},deliveryModeActive:{backgroundColor:'#FF5A1F',borderColor:'#FF5A1F',shadowColor:'#B73600',shadowOffset:{width:0,height:5},shadowOpacity:.2,shadowRadius:8,elevation:4},deliveryModeTitle:{fontSize:13,fontWeight:'900',color:'#202124'},deliveryModeTitleActive:{color:'#FFF'},deliveryModeText:{fontSize:9,color:'#807670',marginTop:2},deliveryModeTextActive:{color:'#FFE4D7'},
  serviceCardActive: { backgroundColor: '#FFF0E8', borderColor: '#FF8A52', borderWidth: 1.5 },
  serviceIconWrap: { width: 45, height: 45, borderRadius: 14, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  serviceVehicleImage: { width: 43, height: 43, resizeMode: 'contain' },
  moliBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F4FF', borderRadius: 12, padding: 12, marginTop: 8 },
  moliTag: { backgroundColor: '#7C3AED', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginRight: 10 },
  moliTagText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  moliBannerText: { flex: 1, fontSize: 13, color: '#5B21B6' },

  // ─── Confirm Panel ───
  confirmPanel: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingBottom: 40, maxHeight: SH * 0.58, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 8 },
  routeSummary: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F2F2F7' },
  routeDots: { alignItems: 'center', marginRight: 12 },
  dotLine: { width: 2, height: 20, backgroundColor: '#E5E5EA', marginVertical: 3 },
  routeAddr: { fontSize: 14, fontWeight: '600', color: '#1C1C1E', marginBottom: 8, flex: 1 },
  routeAddr2: { fontSize: 14, color: '#8E8E93', flex: 1 },
  editableAddr: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  stopRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 4 },
  stopAddr: { fontSize: 13, color: '#007AFF', flex: 1 },
  removeStopBtn: { padding: 4 },
  addStopBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingLeft: 4 },
  addStopText: { fontSize: 13, color: '#007AFF', fontWeight: '600' },
  routeStats: { alignItems: 'flex-end', marginLeft: 12 },
  routeStatVal: { fontSize: 14, fontWeight: '700', color: '#1C1C1E' },
  routeStatLabel: { fontSize: 12, color: '#8E8E93', marginTop: 2 },

  vehicleList: { paddingHorizontal: 12, maxHeight: SH * 0.25 },
  vehicleItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, marginVertical: 2, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  vehicleItemSel: { borderColor: '#FF7733', backgroundColor: '#FFF3F0' },
  vehicleEmoji: { fontSize: 32 },
  vehicleName: { fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  vehicleEta: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  vehiclePrice: { fontSize: 18, fontWeight: '800', color: '#1C1C1E' },

  payRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 10, borderTopWidth: 1, borderTopColor: '#F2F2F7' },
  payText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1C1C1E' },

  confirmBtn: { backgroundColor: '#FF5A1F', marginHorizontal: 20, paddingVertical: 18, borderRadius: 18, alignItems: 'center', shadowColor: '#B73600', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.24, shadowRadius: 10, elevation: 5 },
  confirmBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  // ─── Searching Panel ───
  searchingPanel: { backgroundColor: '#FFF9F4', borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: 9, paddingBottom: Platform.OS === 'ios' ? 28 : 20, paddingHorizontal: 20, shadowColor: '#6D2C0D', shadowOffset: { width: 0, height: -7 }, shadowOpacity: 0.16, shadowRadius: 18, elevation: 12, borderTopWidth: 1, borderColor: '#FFE5D7', height: Platform.OS === 'web' && SW > 720 ? SH * .53 : SH * .6, maxHeight: 570 },
  searchingContainer: { alignItems: 'center' },
  searchingContainerBounded: { flex: 1, width: '100%' },
  searchingScroll: { width: '100%' },
  searchingScrollContent: { alignItems: 'center', paddingBottom: 4 },
  searchRadarWrap: { width: Platform.OS === 'web' && SW > 720 ? 118 : 104, height: Platform.OS === 'web' && SW > 720 ? 118 : 104, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  searchRadarPulse: { position: 'absolute', width: 92, height: 92, borderRadius: 46, backgroundColor: '#FF8B58' },
  searchRadarRingOuter: { position: 'absolute', width: 100, height: 100, borderRadius: 50, borderWidth: 1.5, borderColor: '#FFD1BB' },
  searchRadarRingInner: { position: 'absolute', width: 76, height: 76, borderRadius: 38, borderWidth: 1.5, borderColor: '#FFB18E' },
  searchMoliOrb: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF5A1F', borderWidth: 3, borderColor: '#FFF', shadowColor: '#C83A00', shadowOffset: { width: 0, height: 7 }, shadowOpacity: .28, shadowRadius: 11, elevation: 7 },
  searchMoliLetter: { color: '#FFF', fontSize: 26, lineHeight: 30, fontWeight: '900' },
  radarVehicle: { position: 'absolute', zIndex: 2 },
  radarVehicleLeft: { left: -5, bottom: 4, transform: [{ rotate: '-12deg' }] },
  radarVehicleRight: { right: -6, top: 3, transform: [{ rotate: '9deg' }] },
  searchingTitle: { fontSize: Platform.OS === 'web' && SW > 720 ? 28 : 23, lineHeight: 32, fontWeight: '900', color: '#201C1A', letterSpacing: -.5, textAlign: 'center' },
  searchingSubtitle: { fontSize: 13, color: '#867A74', marginTop: 2, marginBottom: 12, textAlign: 'center' },
  searchStatusCard: { width: '100%', maxWidth: 620, minHeight: 66, flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 19, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#F3E6DE', shadowColor: '#633017', shadowOffset: { width: 0, height: 5 }, shadowOpacity: .1, shadowRadius: 10, elevation: 3 },
  searchAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0E8', marginRight: 11 },
  searchStatusCopy: { flex: 1 },
  searchDots: { flexDirection: 'row', gap: 5, marginBottom: 5 },
  searchDotStrong: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF5A1F' },
  searchDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF8B58' },
  searchDotSoft: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFC3A8' },
  searchStatusText: { fontSize: 14, fontWeight: '800', color: '#282321' },
  searchTripCard: { width: '100%', maxWidth: 620, minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 9, marginTop: 9, borderRadius: 19, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#F3E6DE', shadowColor: '#633017', shadowOffset: { width: 0, height: 4 }, shadowOpacity: .08, shadowRadius: 8, elevation: 2 },
  searchTripMeta: { fontSize: 12, color: '#827872', marginBottom: 2 },
  searchTripPrice: { fontSize: 18, fontWeight: '900', color: '#201C1A' },
  searchPrivacy: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10, paddingHorizontal: 5 },
  searchPrivacyText: { fontSize: 11, color: '#8E8E93', textAlign: 'center' },
  playWhileWaitingBtn: { width: '100%', maxWidth: 620, minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#F0DED4', paddingHorizontal: 16, borderRadius: 17, marginTop: 12, shadowColor: '#6D2C0D', shadowOffset: { width: 0, height: 4 }, shadowOpacity: .1, shadowRadius: 8, elevation: 3 },
  playIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0E8' },
  playWhileWaitingText: { fontSize: 14, fontWeight: '800', color: '#282321' },
  searchingText: { fontSize: 17, fontWeight: '600', color: '#1C1C1E', marginTop: 20, textAlign: 'center' },
  progressBar: { width: '70%', height: 4, backgroundColor: '#E5E5EA', borderRadius: 2, marginTop: 16, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#00C853', borderRadius: 2 },
  searchingHint: { fontSize: 13, color: '#8E8E93', marginTop: 12 },
  cancelSearchBtn: { width: '100%', maxWidth: 620, marginTop: 10, minHeight: 52, justifyContent: 'center', alignItems: 'center', borderRadius: 17, borderWidth: 1.5, borderColor: '#FF5A1F', backgroundColor: '#FFF9F4' },
  cancelSearchText: { color: '#F04B14', fontSize: 15, fontWeight: '800' },
  cancelActiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#FF3B30',
  },
  cancelActiveText: { color: '#FF3B30', fontSize: 14, fontWeight: '600' },
  foundContainer: { alignItems: 'center' },
  foundCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#00C853', justifyContent: 'center', alignItems: 'center' },
  foundText: { fontSize: 20, fontWeight: '700', color: '#1C1C1E', marginTop: 16 },
  foundSub: { fontSize: 14, color: '#8E8E93', marginTop: 6 },

  // ─── Active Ride ───
  activeCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 8 },
  activeStatusBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', backgroundColor: '#F2F2F7', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginBottom: 16, gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  activeStatusText: { fontSize: 14, fontWeight: '600', color: '#1C1C1E' },

  driverRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  driverAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#1C1C1E', justifyContent: 'center', alignItems: 'center' },
  driverName: { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  ratingVal: { fontSize: 13, color: '#1C1C1E' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },

  vehicleRow: { backgroundColor: '#F2F2F7', borderRadius: 12, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  vehiclePlate: { fontSize: 18, fontWeight: '800', color: '#1C1C1E', letterSpacing: 1 },
  vehicleDesc: { fontSize: 13, color: '#8E8E93' },

  fareRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fareLabel: { fontSize: 14, color: '#8E8E93' },
  fareVal: { fontSize: 24, fontWeight: '800', color: '#1C1C1E' },

  // ─── Search Modal ───
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  modalBack: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  searchInputWrap: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, backgroundColor: '#F2F2F7', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  searchInput: { flex: 1, fontSize: 16, color: '#1C1C1E' },
  resultsList: { flex: 1, marginTop: 8 },
  resultItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  resultIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' },
  resultName: { fontSize: 15, fontWeight: '600', color: '#1C1C1E' },
  resultAddr: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  noResults: { textAlign: 'center', marginTop: 40, fontSize: 15, color: '#8E8E93' },

  // ─── Completed ───
  completedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#fff' },
  completedIcon: { marginBottom: 16 },
  completedTitle: { fontSize: 26, fontWeight: '800', color: '#1C1C1E' },
  completedSubtitle: { fontSize: 15, color: '#8E8E93', marginTop: 6 },
  completedCard: { backgroundColor: '#F8F8FA', borderRadius: 16, padding: 20, width: '100%', marginTop: 32 },
  completedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  completedLabel: { fontSize: 14, color: '#8E8E93' },
  completedFare: { fontSize: 28, fontWeight: '800', color: '#00C853' },
  completedValue: { fontSize: 14, fontWeight: '600', color: '#1C1C1E' },
  completedDivider: { height: 1, backgroundColor: '#E5E5EA', marginVertical: 4 },
  completedBtn: { backgroundColor: '#1C1C1E', width: '100%', paddingVertical: 18, borderRadius: 14, alignItems: 'center', marginTop: 32 },
  completedBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
