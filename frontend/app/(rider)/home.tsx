import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { MapView } from '@/src/components/MapView';
import { Button } from '@/src/components/Button';
import { useAuthStore } from '@/src/stores/authStore';
import { useRideStore, Bid } from '@/src/stores/rideStore';
import { socketService } from '@/src/services/socket';
import {
  getCurrentLocation,
  reverseGeocode,
  searchPlaces,
  estimateDriving,
  LocationCoords,
  PlaceResult,
} from '@/src/utils/location';

export default function RiderHomeScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const {
    currentRequest,
    currentRide,
    bids,
    createRideRequest,
    acceptBid,
    fetchActiveRide,
    addBid,
    clearRequest,
  } = useRideStore();

  const [userLocation, setUserLocation] = useState<LocationCoords | null>(null);
  const [pickupLocation, setPickupLocation] = useState<LocationCoords | null>(null);
  const [dropoffLocation, setDropoffLocation] = useState<LocationCoords | null>(null);
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [selectedVehicleType, setSelectedVehicleType] = useState('economy');
  const [isLoading, setIsLoading] = useState(false);
  const [showBidsModal, setShowBidsModal] = useState(false);
  const [isSelectingLocation, setIsSelectingLocation] = useState<'pickup' | 'dropoff' | null>(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchType, setSearchType] = useState<'pickup' | 'dropoff'>('dropoff');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [fareEstimates, setFareEstimates] = useState<any[]>([]);
  const [routeInfo, setRouteInfo] = useState<{distance_km: number; duration_min: number} | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [banners, setBanners] = useState<any[]>([]);
  const [isPremium, setIsPremium] = useState(false);
  const [bannerIndex, setBannerIndex] = useState(0);

  const vehicleTypes = [
    { id: 'economy', name: 'Económico', icon: 'car-outline', multiplier: '1x' },
    { id: 'comfort', name: 'Confort', icon: 'car', multiplier: '1.3x' },
    { id: 'premium', name: 'Premium', icon: 'car-sport', multiplier: '1.8x' },
    { id: 'xl', name: 'XL', icon: 'bus', multiplier: '1.5x' },
  ];

  useEffect(() => {
    initializeLocation();
    fetchActiveRide();
    fetchBanners();
  }, []);

  useEffect(() => {
    if (user) {
      const unsubscribe = socketService.on('new_bid', (data: any) => {
        if (data.bid) {
          addBid(data.bid);
        }
      });
      return unsubscribe;
    }
  }, [user]);

  useEffect(() => {
    if (bids.length > 0 && currentRequest) {
      setShowBidsModal(true);
    }
  }, [bids, currentRequest]);

  const initializeLocation = async () => {
    const location = await getCurrentLocation();
    if (location) {
      setUserLocation(location);
      setPickupLocation(location);
      const address = await reverseGeocode(location.latitude, location.longitude);
      setPickupAddress(address);
    }
  };

  const handleMapPress = async (coords: { latitude: number; longitude: number }) => {
    const address = await reverseGeocode(coords.latitude, coords.longitude);
    
    if (isSelectingLocation === 'pickup') {
      setPickupLocation({ ...coords, address });
      setPickupAddress(address);
    } else if (isSelectingLocation === 'dropoff') {
      setDropoffLocation({ ...coords, address });
      setDropoffAddress(address);
    }
    setIsSelectingLocation(null);
  };

  // Debounced search for places
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const results = await searchPlaces(searchQuery, userLocation || undefined);
      setSearchResults(results);
      setIsSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const openSearch = (type: 'pickup' | 'dropoff') => {
    setSearchType(type);
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchModal(true);
  };

  const handleSearchSelect = (place: PlaceResult) => {
    if (searchType === 'pickup') {
      setPickupLocation({ latitude: place.latitude, longitude: place.longitude, address: place.address });
      setPickupAddress(place.name);
      // If dropoff exists, recalculate estimate
      if (dropoffLocation) {
        const est = estimateDriving({ latitude: place.latitude, longitude: place.longitude }, dropoffLocation);
        setRouteInfo(est);
        fetchEstimates(est.distance_km, est.duration_min);
      }
    } else {
      setDropoffLocation({ latitude: place.latitude, longitude: place.longitude, address: place.address });
      setDropoffAddress(place.name);
      // Calculate estimate immediately
      if (pickupLocation) {
        const est = estimateDriving(pickupLocation, { latitude: place.latitude, longitude: place.longitude });
        setRouteInfo(est);
        fetchEstimates(est.distance_km, est.duration_min);
      }
    }
    setShowSearchModal(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleSelectOnMap = () => {
    setShowSearchModal(false);
    setSearchQuery('');
    setIsSelectingLocation(searchType);
  };

  const handleMarkerDrag = async (markerType: string, coords: { latitude: number; longitude: number }) => {
    const address = await reverseGeocode(coords.latitude, coords.longitude);
    if (markerType === 'pickup') {
      setPickupLocation({ ...coords, address });
      setPickupAddress(address);
    } else if (markerType === 'dropoff') {
      setDropoffLocation({ ...coords, address });
      setDropoffAddress(address);
    }
  };

  const fetchEstimates = async (distance_km: number, duration_min: number) => {
    setLoadingEstimate(true);
    try {
      const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const resp = await fetch(`${backendUrl}/api/rides/estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distance_km, duration_min }),
      });
      const data = await resp.json();
      if (data.estimates) {
        setFareEstimates(data.estimates);
        if (data.estimates.length > 0 && !data.estimates.find((e: any) => e.vehicle_type === selectedVehicleType)) {
          setSelectedVehicleType(data.estimates[0].vehicle_type);
        }
      }
    } catch (err) {
      console.error('Error fetching estimates:', err);
    } finally {
      setLoadingEstimate(false);
    }
  };

  const fetchBanners = async () => {
    try {
      const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const resp = await fetch(`${backendUrl}/api/banners`);
      const data = await resp.json();
      if (data.banners) setBanners(data.banners);
    } catch (err) {
      console.error('Error fetching banners:', err);
    }
  };

  const handleRouteInfo = (info: { distance_km: number; duration_min: number }) => {
    setRouteInfo(info);
    fetchEstimates(info.distance_km, info.duration_min);
  };

  const handleRequestRide = async () => {
    if (!pickupLocation || !dropoffLocation) {
      Alert.alert('Error', 'Por favor selecciona las ubicaciones de recogida y destino');
      return;
    }

    setIsLoading(true);
    try {
      await createRideRequest({
        pickup_location: {
          latitude: pickupLocation.latitude,
          longitude: pickupLocation.longitude,
          address: pickupAddress,
        },
        dropoff_location: {
          latitude: dropoffLocation.latitude,
          longitude: dropoffLocation.longitude,
          address: dropoffAddress,
        },
        vehicle_type: selectedVehicleType,
        ride_type: 'standard',
        payment_method: 'cash',
      });
      setShowBidsModal(true);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo solicitar el viaje');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcceptBid = async (bidId: string) => {
    try {
      await acceptBid(bidId);
      setShowBidsModal(false);
      Alert.alert('¡Excelente!', '¡El conductor está en camino!');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo aceptar la oferta');
    }
  };

  const getMapMarkers = () => {
    const markers = [];
    if (pickupLocation) {
      markers.push({
        latitude: pickupLocation.latitude,
        longitude: pickupLocation.longitude,
        title: 'Recogida',
        type: 'pickup' as const,
        draggable: true,
      });
    }
    if (dropoffLocation) {
      markers.push({
        latitude: dropoffLocation.latitude,
        longitude: dropoffLocation.longitude,
        title: 'Destino',
        type: 'dropoff' as const,
      });
    }
    if (currentRide?.driver_location) {
      markers.push({
        latitude: currentRide.driver_location.latitude,
        longitude: currentRide.driver_location.longitude,
        title: 'Conductor',
        type: 'driver' as const,
      });
    }
    return markers;
  };

  // Vista de viaje activo
  if (currentRide && ['accepted', 'arrived', 'started'].includes(currentRide.status)) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.mapContainer}>
          <MapView
            initialRegion={pickupLocation ? {
              latitude: pickupLocation.latitude,
              longitude: pickupLocation.longitude,
            } : undefined}
            markers={getMapMarkers()}
            showRoute={true}
          />
        </View>
        
        <View style={styles.activeRideCard}>
          <View style={styles.rideStatusHeader}>
            <View style={[styles.statusBadge, styles[`status_${currentRide.status}`]]}>
              <Text style={styles.statusText}>
                {currentRide.status === 'accepted' ? 'Conductor en camino' :
                 currentRide.status === 'arrived' ? 'Conductor ha llegado' : 'En viaje'}
              </Text>
            </View>
          </View>
          
          {currentRide.driver_info && (
            <View style={styles.driverInfo}>
              <View style={styles.driverAvatar}>
                <Ionicons name="person" size={32} color="#6BBF00" />
              </View>
              <View style={styles.driverDetails}>
                <Text style={styles.driverName}>{currentRide.driver_info.name}</Text>
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={16} color="#FFD700" />
                  <Text style={styles.ratingText}>{currentRide.driver_info.rating?.toFixed(1)}</Text>
                </View>
              </View>
              <View style={styles.driverActions}>
                <TouchableOpacity style={styles.actionButton}>
                  <Ionicons name="call" size={24} color="#34C759" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => router.push({
                    pathname: '/chat',
                    params: { rideId: currentRide.ride_id, otherName: currentRide.driver_info?.name || 'Conductor' }
                  })}
                >
                  <Ionicons name="chatbubble" size={24} color="#6BBF00" />
                </TouchableOpacity>
              </View>
            </View>
          )}
          
          {currentRide.vehicle_info && (
            <View style={styles.vehicleInfo}>
              <Text style={styles.vehicleText}>
                {currentRide.vehicle_info.color} {currentRide.vehicle_info.make} {currentRide.vehicle_info.model}
              </Text>
              <Text style={styles.plateText}>{currentRide.vehicle_info.plate_number}</Text>
            </View>
          )}
          
          <View style={styles.fareInfo}>
            <Text style={styles.fareLabel}>Tarifa</Text>
            <Text style={styles.fareAmount}>${currentRide.fare?.toFixed(2)}</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Encabezado */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hola, {user?.name?.split(' ')[0] || 'Pasajero'}</Text>
          <Text style={styles.subGreeting}>¿A dónde vamos?</Text>
        </View>
        <TouchableOpacity style={styles.notificationButton}>
          <Ionicons name="notifications-outline" size={24} color="#1C1C1E" />
        </TouchableOpacity>
      </View>

      {/* Mapa */}
      <View style={styles.mapContainer}>
        <MapView
          initialRegion={userLocation ? {
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
          } : undefined}
          markers={getMapMarkers()}
          showRoute={pickupLocation && dropoffLocation ? true : false}
          onMapPress={isSelectingLocation ? handleMapPress : undefined}
          onMarkerDrag={handleMarkerDrag}
          onRouteInfo={handleRouteInfo}
        />
        
        {isSelectingLocation && (
          <View style={styles.selectingOverlay}>
            <Text style={styles.selectingText}>
              Toca en el mapa para seleccionar {isSelectingLocation === 'pickup' ? 'el punto de recogida' : 'el destino'}
            </Text>
            <Button
              title="Cancelar"
              onPress={() => setIsSelectingLocation(null)}
              variant="outline"
              size="small"
            />
          </View>
        )}
      </View>

      {/* Panel de reserva estilo Cabify */}
      <View style={styles.bookingPanel}>
        {/* Inputs de ubicación */}
        <View style={styles.locationInputs}>
          <TouchableOpacity
            style={styles.locationInput}
            onPress={() => openSearch('pickup')}
          >
            <View style={[styles.locationDot, styles.pickupDot]} />
            <Text style={pickupAddress ? styles.locationText : styles.placeholderText} numberOfLines={1}>
              {pickupAddress || 'Punto de recogida'}
            </Text>
            <TouchableOpacity onPress={initializeLocation} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
              <Ionicons name="locate" size={20} color="#6BBF00" />
            </TouchableOpacity>
          </TouchableOpacity>
          
          <View style={styles.locationDivider} />
          
          <TouchableOpacity
            style={styles.locationInput}
            onPress={() => openSearch('dropoff')}
          >
            <View style={[styles.locationDot, styles.dropoffDot]} />
            <Text style={dropoffAddress ? styles.locationText : styles.placeholderText} numberOfLines={1}>
              {dropoffAddress || '¿A dónde vas?'}
            </Text>
            <Ionicons name="search" size={20} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        {/* Banner publicitario */}
        {!isPremium && banners.length > 0 && (
          <TouchableOpacity style={[styles.bannerCard, { backgroundColor: banners[bannerIndex % banners.length]?.bg_color || '#6B21A8' }]}>
            <View style={styles.bannerContent}>
              <Text style={[styles.bannerTitle, { color: banners[bannerIndex % banners.length]?.text_color || '#fff' }]} numberOfLines={1}>
                {banners[bannerIndex % banners.length]?.title}
              </Text>
              <Text style={[styles.bannerDesc, { color: banners[bannerIndex % banners.length]?.text_color || '#fff' }]} numberOfLines={1}>
                {banners[bannerIndex % banners.length]?.description}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={banners[bannerIndex % banners.length]?.text_color || '#fff'} />
          </TouchableOpacity>
        )}

        {/* Promo Molí+ si no hay banners */}
        {!isPremium && banners.length === 0 && (
          <TouchableOpacity style={styles.moliPlusCard}>
            <View style={styles.moliPlusBadge}>
              <Text style={styles.moliPlusBadgeText}>Molí+</Text>
            </View>
            <Text style={styles.moliPlusText}>Sin publicidad y beneficios exclusivos</Text>
            <Ionicons name="chevron-forward" size={18} color="#6B21A8" />
          </TouchableOpacity>
        )}

        {/* Info de ruta + estimaciones */}
        {routeInfo && fareEstimates.length > 0 && (
          <View style={styles.routeInfoBar}>
            <Ionicons name="navigate" size={16} color="#6BBF00" />
            <Text style={styles.routeInfoText}>
              {routeInfo.distance_km.toFixed(1)} km · {routeInfo.duration_min} min
            </Text>
          </View>
        )}

        {/* Tarjetas de vehículos con precios */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.vehicleTypesScroll}
          contentContainerStyle={styles.vehicleTypesContent}
        >
          {(fareEstimates.length > 0 ? fareEstimates : vehicleTypes).map((type: any) => {
            const isEstimate = !!type.estimated_fare;
            const id = type.vehicle_type || type.id;
            const name = type.display_name || type.name;
            const price = type.estimated_fare;
            const isSelected = selectedVehicleType === id;
            const iconMap: any = { economy: 'car-outline', comfort: 'car', premium: 'car-sport', xl: 'bus' };
            const emojiMap: any = { economy: '🚗', comfort: '🚙', premium: '🏎️', xl: '🚌' };
            return (
              <TouchableOpacity
                key={id}
                style={[styles.vehicleCard, isSelected && styles.vehicleCardSelected]}
                onPress={() => setSelectedVehicleType(id)}
              >
                <Text style={styles.vehicleEmoji}>{emojiMap[id] || '🚗'}</Text>
                <Text style={[styles.vehicleCardName, isSelected && styles.vehicleCardNameSel]}>
                  {name}
                </Text>
                {isEstimate ? (
                  <Text style={[styles.vehicleCardPrice, isSelected && styles.vehicleCardPriceSel]}>
                    ${Math.round(price).toLocaleString()}
                  </Text>
                ) : (
                  <Text style={styles.vehicleCardMult}>{type.multiplier}</Text>
                )}
                {loadingEstimate && <ActivityIndicator size="small" color="#6BBF00" style={{marginTop: 2}} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Botón de solicitar */}
        {(() => {
          const selected = fareEstimates.find((e: any) => e.vehicle_type === selectedVehicleType);
          const priceLabel = selected ? ` · $${Math.round(selected.estimated_fare).toLocaleString()}` : '';
          const typeName = selected?.display_name || vehicleTypes.find(v => v.id === selectedVehicleType)?.name || '';
          return (
            <TouchableOpacity
              style={[
                styles.requestBtn,
                (!pickupLocation || !dropoffLocation || isLoading || !!currentRequest) && styles.requestBtnDisabled
              ]}
              onPress={handleRequestRide}
              disabled={!pickupLocation || !dropoffLocation || isLoading || !!currentRequest}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.requestBtnText}>
                  {currentRequest ? 'Buscando conductores...' : `Solicitar ${typeName}${priceLabel}`}
                </Text>
              )}
            </TouchableOpacity>
          );
        })()}

        {currentRequest && (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => { clearRequest(); setShowBidsModal(false); }}
          >
            <Text style={styles.cancelBtnText}>Cancelar solicitud</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Modal de búsqueda de ubicación */}
      <Modal visible={showSearchModal} animationType="slide">
        <SafeAreaView style={styles.searchModal}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}}>
            <View style={styles.searchHeader}>
              <TouchableOpacity onPress={() => { setShowSearchModal(false); setSearchQuery(''); }} style={styles.searchBackBtn}>
                <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
              </TouchableOpacity>
              <Text style={styles.searchTitle}>
                {searchType === 'pickup' ? 'Punto de recogida' : '¿A dónde vas?'}
              </Text>
              <View style={{width: 40}} />
            </View>

            <View style={styles.searchInputWrap}>
              <View style={styles.searchInputContainer}>
                <Ionicons name="search" size={20} color="#8E8E93" />
                <TextInput
                  style={styles.searchInput}
                  placeholder={searchType === 'pickup' ? 'Buscar dirección de recogida...' : 'Buscar dirección, lugar...'}
                  placeholderTextColor="#8E8E93"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoFocus
                  returnKeyType="search"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={20} color="#C7C7CC" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <ScrollView style={styles.searchResultsList} keyboardShouldPersistTaps="handled">
              {searchType === 'pickup' && (
                <TouchableOpacity style={styles.searchResultItem} onPress={() => { initializeLocation(); setShowSearchModal(false); }}>
                  <View style={[styles.searchResultIcon, {backgroundColor: '#E8F5E9'}]}>
                    <Ionicons name="navigate" size={20} color="#6BBF00" />
                  </View>
                  <View style={styles.searchResultTextWrap}>
                    <Text style={styles.searchResultName}>Mi ubicación actual</Text>
                    <Text style={styles.searchResultAddr}>Usar GPS</Text>
                  </View>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.searchResultItem} onPress={handleSelectOnMap}>
                <View style={[styles.searchResultIcon, {backgroundColor: '#FFF3E0'}]}>
                  <Ionicons name="map" size={20} color="#FF9800" />
                </View>
                <View style={styles.searchResultTextWrap}>
                  <Text style={styles.searchResultName}>Seleccionar en el mapa</Text>
                  <Text style={styles.searchResultAddr}>Toca un punto en el mapa</Text>
                </View>
              </TouchableOpacity>

              {(searchResults.length > 0 || isSearching) && <View style={styles.searchDivider} />}

              {searchResults.map((place) => (
                <TouchableOpacity key={place.id} style={styles.searchResultItem} onPress={() => handleSearchSelect(place)}>
                  <View style={styles.searchResultIcon}>
                    <Ionicons name="location" size={20} color="#007AFF" />
                  </View>
                  <View style={styles.searchResultTextWrap}>
                    <Text style={styles.searchResultName} numberOfLines={1}>{place.name}</Text>
                    <Text style={styles.searchResultAddr} numberOfLines={1}>{place.address}</Text>
                  </View>
                </TouchableOpacity>
              ))}

              {isSearching && (
                <View style={styles.searchLoading}>
                  <ActivityIndicator color="#6BBF00" />
                  <Text style={styles.searchLoadingText}>Buscando...</Text>
                </View>
              )}

              {!isSearching && searchQuery.length >= 2 && searchResults.length === 0 && (
                <Text style={styles.noResults}>No se encontraron resultados</Text>
              )}

              {searchQuery.length < 2 && !isSearching && (
                <Text style={styles.searchHint}>Escribe al menos 2 caracteres para buscar</Text>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Modal de ofertas */}
      <Modal
        visible={showBidsModal && (bids.length > 0 || !!currentRequest)}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Conductores disponibles</Text>
              <TouchableOpacity onPress={() => setShowBidsModal(false)}>
                <Ionicons name="close" size={24} color="#1C1C1E" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.bidsList}>
              {bids.map((bid) => (
                <View key={bid.bid_id} style={styles.bidCard}>
                  <View style={styles.bidDriverInfo}>
                    <View style={styles.bidDriverAvatar}>
                      <Ionicons name="person" size={24} color="#007AFF" />
                    </View>
                    <View style={styles.bidDriverDetails}>
                      <Text style={styles.bidDriverName}>{bid.driver_name}</Text>
                      <View style={styles.bidRatingRow}>
                        <Ionicons name="star" size={14} color="#FFD700" />
                        <Text style={styles.bidRatingText}>{bid.driver_rating.toFixed(1)}</Text>
                        <Text style={styles.bidArrivalText}>
                          • {bid.estimated_arrival} min
                        </Text>
                      </View>
                      {bid.vehicle_info && (
                        <Text style={styles.bidVehicleText}>
                          {bid.vehicle_info.color} {bid.vehicle_info.make} {bid.vehicle_info.model}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.bidPriceSection}>
                    <Text style={styles.bidPrice}>${bid.fare_amount.toFixed(2)}</Text>
                    <Button
                      title="Aceptar"
                      onPress={() => handleAcceptBid(bid.bid_id)}
                      size="small"
                    />
                  </View>
                </View>
              ))}
            </ScrollView>

            {bids.length === 0 && (
              <View style={styles.noBidsContainer}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.noBidsText}>Buscando conductores cercanos...</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
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
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapContainer: {
    flex: 1,
    margin: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  selectingOverlay: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  selectingText: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  bookingPanel: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  locationInputs: {
    backgroundColor: '#F2F2F7',
    borderRadius: 16,
    padding: 4,
  },
  locationInput: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  locationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  pickupDot: {
    backgroundColor: '#34C759',
  },
  dropoffDot: {
    backgroundColor: '#FF3B30',
  },
  locationText: {
    flex: 1,
    fontSize: 15,
    color: '#1C1C1E',
  },
  placeholderText: {
    flex: 1,
    fontSize: 15,
    color: '#8E8E93',
  },
  locationDivider: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginLeft: 40,
  },
  vehicleTypesScroll: {
    marginTop: 20,
  },
  vehicleTypesContent: {
    paddingRight: 20,
    gap: 12,
  },
  vehicleTypeCard: {
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#F2F2F7',
    minWidth: 80,
  },
  vehicleTypeCardSelected: {
    backgroundColor: '#E8F5E9',
    borderWidth: 2,
    borderColor: '#6BBF00',
  },
  vehicleTypeName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    marginTop: 8,
  },
  vehicleTypeNameSelected: {
    color: '#6BBF00',
  },
  vehicleTypeMultiplier: {
    fontSize: 10,
    color: '#8E8E93',
    marginTop: 4,
  },
  requestButton: {
    marginTop: 20,
  },
  cancelButton: {
    marginTop: 12,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  bidsList: {
    padding: 20,
  },
  bidCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F2F2F7',
    borderRadius: 16,
    marginBottom: 12,
  },
  bidDriverInfo: {
    flexDirection: 'row',
    flex: 1,
  },
  bidDriverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  bidDriverDetails: {
    flex: 1,
  },
  bidDriverName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  bidRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  bidRatingText: {
    fontSize: 13,
    color: '#1C1C1E',
    marginLeft: 4,
  },
  bidArrivalText: {
    fontSize: 13,
    color: '#8E8E93',
    marginLeft: 8,
  },
  bidVehicleText: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
  },
  bidPriceSection: {
    alignItems: 'flex-end',
  },
  bidPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  noBidsContainer: {
    padding: 40,
    alignItems: 'center',
  },
  noBidsText: {
    marginTop: 16,
    fontSize: 16,
    color: '#8E8E93',
  },
  activeRideCard: {
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
  rideStatusHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  status_accepted: {
    backgroundColor: '#FFF3E0',
  },
  status_arrived: {
    backgroundColor: '#E8F5E9',
  },
  status_started: {
    backgroundColor: '#E3F2FD',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  driverAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverDetails: {
    flex: 1,
    marginLeft: 16,
  },
  driverName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  ratingText: {
    fontSize: 14,
    color: '#1C1C1E',
    marginLeft: 4,
  },
  driverActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vehicleInfo: {
    backgroundColor: '#F2F2F7',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  vehicleText: {
    fontSize: 14,
    color: '#1C1C1E',
  },
  plateText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginTop: 4,
  },
  fareInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
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
  // Search modal styles
  searchModal: {
    flex: 1,
    backgroundColor: '#fff',
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  searchBackBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  searchInputWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1C1C1E',
    marginLeft: 10,
    padding: 0,
  },
  searchResultsList: {
    flex: 1,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  searchResultIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  searchResultTextWrap: {
    flex: 1,
  },
  searchResultName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  searchResultAddr: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  searchDivider: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginHorizontal: 16,
    marginVertical: 4,
  },
  searchLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 10,
  },
  searchLoadingText: {
    fontSize: 14,
    color: '#8E8E93',
  },
  noResults: {
    textAlign: 'center',
    color: '#8E8E93',
    fontSize: 14,
    paddingVertical: 24,
  },
  searchHint: {
    textAlign: 'center',
    color: '#C7C7CC',
    fontSize: 13,
    paddingVertical: 24,
  },
  // Banner & Molí+
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  bannerContent: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  bannerDesc: {
    fontSize: 12,
    marginTop: 2,
    opacity: 0.85,
  },
  moliPlusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E8FF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  moliPlusBadge: {
    backgroundColor: '#6B21A8',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 10,
  },
  moliPlusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  moliPlusText: {
    flex: 1,
    fontSize: 13,
    color: '#6B21A8',
    fontWeight: '500',
  },
  // Route info
  routeInfoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  routeInfoText: {
    fontSize: 13,
    color: '#6BBF00',
    fontWeight: '600',
  },
  // Vehicle cards
  vehicleCard: {
    backgroundColor: '#F2F2F7',
    borderRadius: 14,
    padding: 12,
    marginRight: 10,
    width: 90,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  vehicleCardSelected: {
    borderColor: '#6BBF00',
    backgroundColor: '#F0FFF0',
  },
  vehicleEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  vehicleCardName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 2,
  },
  vehicleCardNameSel: {
    color: '#1C1C1E',
  },
  vehicleCardPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  vehicleCardPriceSel: {
    color: '#6BBF00',
  },
  vehicleCardMult: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
  },
  // Request button
  requestBtn: {
    backgroundColor: '#6BBF00',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  requestBtnDisabled: {
    backgroundColor: '#C7C7CC',
  },
  requestBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelBtn: {
    borderWidth: 1.5,
    borderColor: '#EF4444',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelBtnText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
  },
});
