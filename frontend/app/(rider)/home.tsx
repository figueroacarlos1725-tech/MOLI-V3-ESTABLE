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
  Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { MapView } from '@/src/components/MapView';
import { useAuthStore } from '@/src/stores/authStore';
import { useRideStore } from '@/src/stores/rideStore';
import { socketService } from '@/src/services/socket';
import { apiService } from '@/src/services/api';
import { Audio } from 'expo-av';
import SideMenu from '@/src/components/SideMenu';
import BannerPopup from '@/src/components/BannerPopup';
import CancelRideModal from '@/src/components/CancelRideModal';
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
  const { currentRequest, currentRide, bids, createRideRequest, acceptBid, fetchActiveRide, addBid, clearRequest, updateRideStatus } = useRideStore();

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

  // Banners
  const [banners, setBanners] = useState<any[]>([]);

  // Refs to prevent loops
  const estimateFetched = useRef(false);
  const lastRideStatus = useRef<string>('');

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
    fetchActiveRide().then((ride) => {
      if (ride && ['accepted', 'arrived', 'started'].includes(ride.status)) {
        setPhase('active');
      }
    });
    fetchBanners();
    // Load cancellation config
    apiService.get('/cancellation/config').then(setCancelConfig).catch(() => {});
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
            setTimeout(() => { handleFinishRide(); }, 4000);
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

    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); unsub6(); unsub7(); };
  }, [user]);

  // ─── Polling fallback when searching ──────
  useEffect(() => {
    if (phase !== 'searching') return;
    
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

    return () => clearInterval(pollInterval);
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

  // ─── Memoized markers (prevents re-render loop) ───
  const markers = useMemo(() => {
    const m: any[] = [];
    const isDraggable = phase === 'confirm' || phase === 'idle';
    if (pickupLocation) m.push({ latitude: pickupLocation.latitude, longitude: pickupLocation.longitude, title: 'Recogida', type: 'pickup' as const, draggable: isDraggable });
    if (dropoffLocation) m.push({ latitude: dropoffLocation.latitude, longitude: dropoffLocation.longitude, title: 'Destino', type: 'dropoff' as const, draggable: phase === 'confirm' });
    if (currentRide?.driver_location) m.push({ latitude: currentRide.driver_location.latitude, longitude: currentRide.driver_location.longitude, title: 'Conductor', type: 'driver' as const });
    return m;
  }, [pickupLocation?.latitude, pickupLocation?.longitude, dropoffLocation?.latitude, dropoffLocation?.longitude, currentRide?.driver_location?.latitude, phase]);

  const emojiMap: Record<string, string> = { economy: '🚗', comfort: '🚙', premium: '🏎️', xl: '🚌' };
  const nameMap: Record<string, string> = { economy: 'Económico', comfort: 'Confort', premium: 'Premium', xl: 'XL' };
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
            <Ionicons name="checkmark-circle" size={72} color="#A855F7" />
          </View>
          <Text style={s.completedTitle}>¡Viaje completado!</Text>
          <Text style={s.completedSubtitle}>Gracias por viajar con Moli</Text>

          <View style={s.completedCard}>
            <View style={s.completedRow}>
              <Text style={s.completedLabel}>Tarifa total</Text>
              <Text style={s.completedFare}>${currentRide.fare?.toFixed(0)}</Text>
            </View>
            {currentRide.penalty_surcharge > 0 && (
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
            {currentRide.vehicle_info && (
              <View style={s.completedRow}>
                <Text style={s.completedLabel}>Vehículo</Text>
                <Text style={s.completedValue}>{currentRide.vehicle_info.plate_number}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity style={s.completedBtn} onPress={handleFinishRide}>
            <Text style={s.completedBtnText}>Volver al inicio</Text>
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
          <View style={s.activeStatusBadge}>
            <View style={[s.statusDot, currentRide.status === 'arrived' ? { backgroundColor: '#FF9500' } : currentRide.status === 'started' ? { backgroundColor: '#007AFF' } : { backgroundColor: '#34C759' }]} />
            <Text style={s.activeStatusText}>{statusLabels[currentRide.status] || currentRide.status}</Text>
          </View>
          {currentRide.driver_info && (
            <View style={s.driverRow}>
              <View style={s.driverAvatar}><Ionicons name="person" size={28} color="#fff" /></View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.driverName}>{currentRide.driver_info.name}</Text>
                <View style={s.ratingRow}>
                  <Ionicons name="star" size={14} color="#FFD700" />
                  <Text style={s.ratingVal}>{(currentRide.driver_info.rating || 5).toFixed(1)}</Text>
                </View>
              </View>
              <TouchableOpacity style={s.iconBtn} onPress={() => router.push({ pathname: '/chat', params: { rideId: currentRide.ride_id, otherName: currentRide.driver_info?.name || 'Conductor' } })}>
                <Ionicons name="chatbubble-ellipses" size={22} color="#A855F7" />
              </TouchableOpacity>
              <TouchableOpacity style={s.iconBtn}><Ionicons name="call" size={22} color="#34C759" /></TouchableOpacity>
            </View>
          )}
          {currentRide.vehicle_info && (
            <View style={s.vehicleRow}>
              <Text style={s.vehiclePlate}>{currentRide.vehicle_info.plate_number}</Text>
              <Text style={s.vehicleDesc}>{currentRide.vehicle_info.color} {currentRide.vehicle_info.make} {currentRide.vehicle_info.model}</Text>
            </View>
          )}
          <View style={s.fareRow}>
            <Text style={s.fareLabel}>Tarifa estimada</Text>
            <Text style={s.fareVal}>${currentRide.fare?.toFixed(0)}</Text>
          </View>
          
          {/* Cancel ride - only before trip starts */}
          {(currentRide.status === 'accepted' || currentRide.status === 'arrived') && (
            <TouchableOpacity style={s.cancelActiveBtn} onPress={() => setShowCancelModal(true)}>
              <Ionicons name="close-circle-outline" size={18} color="#FF3B30" />
              <Text style={s.cancelActiveText}>Cancelar viaje</Text>
            </TouchableOpacity>
          )}
        </View>
        
        {/* Cancel Ride Modal */}
        <CancelRideModal
          visible={showCancelModal}
          onClose={() => setShowCancelModal(false)}
          onConfirmCancel={async () => {
            try {
              const response = await updateRideStatus(currentRide.ride_id, 'cancelled');
              setShowCancelModal(false);
              if (response?.penalty?.penalty_applied) {
                setErrorMsg(response.penalty.message);
              }
              setPhase('idle');
              fetchActiveRide();
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

        {/* Back button when confirming */}
        {(phase === 'confirm' || phase === 'searching') && (
          <TouchableOpacity style={s.mapBackBtn} onPress={handleBackToIdle}>
            <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
          </TouchableOpacity>
        )}
      </View>

      {/* ═══ Bottom Panel ═══ */}
      {phase === 'idle' && (
        <View style={s.bottomPanel}>
          {/* Greeting */}
          <Text style={s.greeting}>Hola, {user?.name?.split(' ')[0] || 'Pasajero'}</Text>

          {/* Search bar like Uber */}
          <TouchableOpacity style={s.searchBar} onPress={() => { setSearchType('dropoff'); setSearchModal(true); }}>
            <View style={s.searchIcon}><Ionicons name="search" size={20} color="#A855F7" /></View>
            <Text style={s.searchPlaceholder}>¿A dónde vamos?</Text>
          </TouchableOpacity>

          {/* Origin row */}
          <TouchableOpacity style={s.originRow} onPress={() => { setSearchType('pickup'); setSearchModal(true); }}>
            <View style={[s.dot, { backgroundColor: '#34C759' }]} />
            <Text style={s.originText} numberOfLines={1}>{pickupAddress || 'Mi ubicación'}</Text>
            <TouchableOpacity onPress={initLocation} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="locate" size={18} color="#A855F7" />
            </TouchableOpacity>
          </TouchableOpacity>

          {/* Moli+ Banner */}
          <TouchableOpacity style={s.moliBanner}>
            <View style={s.moliTag}><Text style={s.moliTagText}>Moli+</Text></View>
            <Text style={s.moliBannerText}>Sin publicidad y beneficios exclusivos</Text>
            <Ionicons name="chevron-forward" size={18} color="#8E8E93" />
          </TouchableOpacity>
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
            {(fareEstimates.length > 0 ? fareEstimates : [
              { vehicle_type: 'economy', display_name: 'Económico', estimated_fare: 0 },
              { vehicle_type: 'comfort', display_name: 'Confort', estimated_fare: 0 },
              { vehicle_type: 'premium', display_name: 'Premium', estimated_fare: 0 },
              { vehicle_type: 'xl', display_name: 'XL', estimated_fare: 0 },
            ]).map((v: any) => {
              const id = v.vehicle_type;
              const sel = selectedVehicle === id;
              const eta = routeInfo ? routeInfo.duration_min + (id === 'economy' ? 3 : id === 'comfort' ? 2 : id === 'premium' ? 1 : 5) : null;
              return (
                <TouchableOpacity key={id} style={[s.vehicleItem, sel && s.vehicleItemSel]} onPress={() => setSelectedVehicle(id)}>
                  <Text style={s.vehicleEmoji}>{emojiMap[id] || '🚗'}</Text>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[s.vehicleName, sel && { color: '#2D7600' }]}>{v.display_name || nameMap[id]}</Text>
                    {eta && <Text style={s.vehicleEta}>{eta} min</Text>}
                  </View>
                  <Text style={[s.vehiclePrice, sel && { color: '#A855F7' }]}>
                    {v.estimated_fare > 0 ? `$${Math.round(v.estimated_fare).toLocaleString()}` : '...'}
                  </Text>
                  {sel && <Ionicons name="checkmark-circle" size={20} color="#A855F7" style={{ marginLeft: 8 }} />}
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
                Confirmar {nameMap[selectedVehicle]}{selectedFare ? ` · $${Math.round(selectedFare.estimated_fare).toLocaleString()}` : ''}
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
            <View style={s.searchingContainer}>
              <ActivityIndicator size="large" color="#A855F7" />
              <Text style={s.searchingText}>{dispatchMsg || 'Buscando conductores cercanos...'}</Text>
              {dispatchProgress && (
                <View style={s.progressBar}>
                  <View style={[s.progressFill, { width: `${Math.min((dispatchProgress.i / Math.max(dispatchProgress.t, 1)) * 100, 100)}%` }]} />
                </View>
              )}
              <Text style={s.searchingHint}>El sistema busca al conductor más cercano</Text>
              <TouchableOpacity style={s.cancelSearchBtn} onPress={handleCancelSearch}>
                <Text style={s.cancelSearchText}>Cancelar búsqueda</Text>
              </TouchableOpacity>
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

            {isSearching && <ActivityIndicator style={{ marginTop: 20 }} color="#A855F7" />}

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
                  <View style={s.resultIcon}><Ionicons name="location" size={20} color="#A855F7" /></View>
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
      <BannerPopup target="rider" enabled={!!currentRide && currentRide.status === 'started'} intervalMs={90000} />
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
  hamburgerBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 54 : 38, left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4, zIndex: 2 },
  dragHint: { position: 'absolute', top: Platform.OS === 'ios' ? 54 : 38, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(28,28,30,0.85)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, gap: 6, zIndex: 2 },
  dragHintText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // ─── Idle Bottom Panel ───
  bottomPanel: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 8 },
  greeting: { fontSize: 22, fontWeight: '700', color: '#1C1C1E', marginBottom: 16 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F2F2F7', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 16, marginBottom: 12 },
  searchIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  searchPlaceholder: { flex: 1, fontSize: 16, color: '#8E8E93' },
  originRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, gap: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  originText: { flex: 1, fontSize: 14, color: '#1C1C1E' },
  moliBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F4FF', borderRadius: 12, padding: 12, marginTop: 8 },
  moliTag: { backgroundColor: '#7C3AED', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginRight: 10 },
  moliTagText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  moliBannerText: { flex: 1, fontSize: 13, color: '#5B21B6' },

  // ─── Confirm Panel ───
  confirmPanel: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingBottom: 24, maxHeight: SH * 0.55, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 8 },
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
  vehicleItemSel: { borderColor: '#A855F7', backgroundColor: '#F0FFF0' },
  vehicleEmoji: { fontSize: 32 },
  vehicleName: { fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  vehicleEta: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  vehiclePrice: { fontSize: 18, fontWeight: '800', color: '#1C1C1E' },

  payRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 10, borderTopWidth: 1, borderTopColor: '#F2F2F7' },
  payText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1C1C1E' },

  confirmBtn: { backgroundColor: '#1C1C1E', marginHorizontal: 20, paddingVertical: 18, borderRadius: 14, alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  // ─── Searching Panel ───
  searchingPanel: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingVertical: 40, paddingHorizontal: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 8 },
  searchingContainer: { alignItems: 'center' },
  searchingText: { fontSize: 17, fontWeight: '600', color: '#1C1C1E', marginTop: 20, textAlign: 'center' },
  progressBar: { width: '70%', height: 4, backgroundColor: '#E5E5EA', borderRadius: 2, marginTop: 16, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#A855F7', borderRadius: 2 },
  searchingHint: { fontSize: 13, color: '#8E8E93', marginTop: 12 },
  cancelSearchBtn: { marginTop: 24, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 10, borderWidth: 1.5, borderColor: '#FF3B30' },
  cancelSearchText: { color: '#FF3B30', fontSize: 15, fontWeight: '600' },
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
  foundCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#A855F7', justifyContent: 'center', alignItems: 'center' },
  foundText: { fontSize: 20, fontWeight: '700', color: '#1C1C1E', marginTop: 16 },
  foundSub: { fontSize: 14, color: '#8E8E93', marginTop: 6 },

  // ─── Active Ride ───
  activeCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 8 },
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
  completedFare: { fontSize: 28, fontWeight: '800', color: '#A855F7' },
  completedValue: { fontSize: 14, fontWeight: '600', color: '#1C1C1E' },
  completedDivider: { height: 1, backgroundColor: '#E5E5EA', marginVertical: 4 },
  completedBtn: { backgroundColor: '#1C1C1E', width: '100%', paddingVertical: 18, borderRadius: 14, alignItems: 'center', marginTop: 32 },
  completedBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
