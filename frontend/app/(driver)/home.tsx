import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  Switch,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MapView } from '@/src/components/MapView';
import { Button } from '@/src/components/Button';
import { useAuthStore } from '@/src/stores/authStore';
import { useRideStore, RideRequest } from '@/src/stores/rideStore';
import { socketService } from '@/src/services/socket';
import { apiService } from '@/src/services/api';
import { getCurrentLocation, reverseGeocode } from '@/src/utils/location';

export default function DriverHomeScreen() {
  const { user } = useAuthStore();
  const { currentRide, fetchActiveRide, updateRideStatus } = useRideStore();
  
  const [isOnline, setIsOnline] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pendingRequests, setPendingRequests] = useState<RideRequest[]>([]);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RideRequest | null>(null);
  const [bidAmount, setBidAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const locationInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    initializeLocation();
    fetchActiveRide();
    
    return () => {
      if (locationInterval.current) {
        clearInterval(locationInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    if (user && isOnline) {
      const unsubscribe = socketService.on('new_ride_request', (data: any) => {
        if (data.request) {
          setPendingRequests(prev => [data.request, ...prev]);
        }
      });
      
      startLocationUpdates();
      
      return () => {
        unsubscribe();
        if (locationInterval.current) {
          clearInterval(locationInterval.current);
        }
      };
    }
  }, [user, isOnline]);

  const initializeLocation = async () => {
    const location = await getCurrentLocation();
    if (location) {
      setUserLocation(location);
    }
  };

  const startLocationUpdates = () => {
    if (locationInterval.current) {
      clearInterval(locationInterval.current);
    }
    
    locationInterval.current = setInterval(async () => {
      const location = await getCurrentLocation();
      if (location && isOnline) {
        setUserLocation(location);
        socketService.sendLocation(location.latitude, location.longitude);
      }
    }, 10000);
  };

  const handleToggleOnline = async (value: boolean) => {
    try {
      await apiService.put(`/drivers/availability?is_online=${value}${userLocation ? `&latitude=${userLocation.latitude}&longitude=${userLocation.longitude}` : ''}`);
      setIsOnline(value);
      
      if (value) {
        Alert.alert('En linea', 'Ahora recibiras solicitudes de viaje');
        fetchPendingRequests();
      } else {
        Alert.alert('Fuera de linea', 'No recibiras nuevas solicitudes');
        setPendingRequests([]);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo actualizar el estado');
    }
  };

  const fetchPendingRequests = async () => {
    if (!userLocation) return;
    
    try {
      const response = await apiService.get(`/rides/requests/pending?latitude=${userLocation.latitude}&longitude=${userLocation.longitude}`);
      setPendingRequests(response.requests || []);
    } catch (error) {
      console.error('Error obteniendo solicitudes:', error);
    }
  };

  const handleViewRequest = (request: RideRequest) => {
    setSelectedRequest(request);
    setBidAmount(request.estimated_fare.toFixed(2));
    setShowRequestModal(true);
  };

  const handleSubmitBid = async () => {
    if (!selectedRequest || !bidAmount) return;
    
    const amount = parseFloat(bidAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Por favor ingresa un monto valido');
      return;
    }
    
    setIsSubmitting(true);
    try {
      await apiService.post('/rides/bid', {
        request_id: selectedRequest.request_id,
        fare_amount: amount,
        estimated_arrival: 5
      });
      
      Alert.alert('Oferta enviada', 'Tu oferta fue enviada al pasajero');
      setShowRequestModal(false);
      setPendingRequests(prev => prev.filter(r => r.request_id !== selectedRequest.request_id));
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo enviar la oferta');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateRideStatus = async (status: string) => {
    if (!currentRide) return;
    
    try {
      await updateRideStatus(currentRide.ride_id, status);
      
      if (status === 'completed') {
        Alert.alert('Viaje completado', `Ganaste $${currentRide.driver_earnings?.toFixed(2)}`);
        fetchActiveRide();
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo actualizar el estado del viaje');
    }
  };

  const getMapMarkers = () => {
    const markers = [];
    if (userLocation) {
      markers.push({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        title: 'Tu ubicacion',
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

  // Vista de viaje activo
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
                <TouchableOpacity style={styles.actionButton}>
                  <Ionicons name="call" size={22} color="#6BBF00" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton}>
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
            {currentRide.status === 'accepted' && (
              <Button
                title="He llegado"
                onPress={() => handleUpdateRideStatus('arrived')}
                variant="secondary"
              />
            )}
            {currentRide.status === 'arrived' && (
              <Button
                title="Iniciar viaje"
                onPress={() => handleUpdateRideStatus('started')}
                variant="secondary"
              />
            )}
            {currentRide.status === 'started' && (
              <Button
                title="Completar viaje"
                onPress={() => handleUpdateRideStatus('completed')}
                variant="secondary"
              />
            )}
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
          <Text style={styles.greeting}>Hola, {user?.name?.split(' ')[0] || 'Conductor'}</Text>
          <Text style={styles.subGreeting}>
            {isOnline ? 'Listo para aceptar viajes' : 'Conectate para empezar a ganar'}
          </Text>
        </View>
        <View style={styles.onlineToggle}>
          <Text style={[styles.onlineLabel, isOnline && styles.onlineLabelActive]}>
            {isOnline ? 'En linea' : 'Desconectado'}
          </Text>
          <Switch
            value={isOnline}
            onValueChange={handleToggleOnline}
            trackColor={{ false: '#E5E5EA', true: '#6BBF00' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* Mapa */}
      <View style={styles.mapContainer}>
        <MapView
          initialRegion={userLocation}
          markers={userLocation ? [{ ...userLocation, title: 'Tu ubicacion', type: 'driver' }] : []}
        />
      </View>

      {/* Solicitudes pendientes */}
      {isOnline && (
        <View style={styles.requestsPanel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Solicitudes cercanas</Text>
            <TouchableOpacity onPress={fetchPendingRequests}>
              <Ionicons name="refresh" size={20} color="#6BBF00" />
            </TouchableOpacity>
          </View>
          
          {pendingRequests.length > 0 ? (
            <ScrollView style={styles.requestsList} horizontal showsHorizontalScrollIndicator={false}>
              {pendingRequests.map((request) => (
                <TouchableOpacity
                  key={request.request_id}
                  style={styles.requestCard}
                  onPress={() => handleViewRequest(request)}
                >
                  <View style={styles.requestHeader}>
                    <Text style={styles.requestDistance}>
                      {request.distance_to_pickup?.toFixed(1) || '?'} km
                    </Text>
                    <Text style={styles.requestFare}>
                      ${request.estimated_fare.toFixed(2)}
                    </Text>
                  </View>
                  <Text style={styles.requestPickup} numberOfLines={1}>
                    {request.pickup_location.address || 'Recogida'}
                  </Text>
                  <Text style={styles.requestDropoff} numberOfLines={1}>
                    {request.dropoff_location.address || 'Destino'}
                  </Text>
                  <View style={styles.requestFooter}>
                    <Text style={styles.requestInfo}>
                      {request.estimated_distance.toFixed(1)} km - {request.estimated_duration} min
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.noRequests}>
              <Ionicons name="car-outline" size={40} color="#E5E5EA" />
              <Text style={styles.noRequestsText}>Sin solicitudes cercanas</Text>
            </View>
          )}
        </View>
      )}

      {/* Modal de oferta */}
      <Modal visible={showRequestModal} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Solicitud de viaje</Text>
              <TouchableOpacity onPress={() => setShowRequestModal(false)}>
                <Ionicons name="close" size={24} color="#1C1C1E" />
              </TouchableOpacity>
            </View>
            
            {selectedRequest && (
              <>
                <View style={styles.requestDetails}>
                  <View style={styles.detailRow}>
                    <Ionicons name="location" size={20} color="#6BBF00" />
                    <Text style={styles.detailText}>
                      {selectedRequest.pickup_location.address || 'Ubicacion de recogida'}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="flag" size={20} color="#FF3B30" />
                    <Text style={styles.detailText}>
                      {selectedRequest.dropoff_location.address || 'Ubicacion de destino'}
                    </Text>
                  </View>
                  <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>{selectedRequest.estimated_distance.toFixed(1)}</Text>
                      <Text style={styles.statLabel}>km</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>{selectedRequest.estimated_duration}</Text>
                      <Text style={styles.statLabel}>min</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>${selectedRequest.estimated_fare.toFixed(0)}</Text>
                      <Text style={styles.statLabel}>tarifa est.</Text>
                    </View>
                  </View>
                </View>
                
                <View style={styles.bidSection}>
                  <Text style={styles.bidLabel}>Tu monto de oferta</Text>
                  <View style={styles.bidInput}>
                    <Text style={styles.currencySymbol}>$</Text>
                    <Text style={styles.bidAmountText}>{bidAmount}</Text>
                  </View>
                  <View style={styles.bidButtons}>
                    <TouchableOpacity
                      style={styles.bidAdjustButton}
                      onPress={() => setBidAmount((parseFloat(bidAmount) - 1).toFixed(2))}
                    >
                      <Ionicons name="remove" size={20} color="#6BBF00" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.bidAdjustButton}
                      onPress={() => setBidAmount((parseFloat(bidAmount) + 1).toFixed(2))}
                    >
                      <Ionicons name="add" size={20} color="#6BBF00" />
                    </TouchableOpacity>
                  </View>
                </View>
                
                <Button
                  title="Enviar oferta"
                  onPress={handleSubmitBid}
                  loading={isSubmitting}
                  variant="secondary"
                  style={styles.submitBidButton}
                />
              </>
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
  mapContainer: {
    flex: 1,
    margin: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  requestsPanel: {
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
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  requestsList: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  requestCard: {
    backgroundColor: '#F2F2F7',
    borderRadius: 16,
    padding: 16,
    marginRight: 12,
    width: 280,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  requestDistance: {
    fontSize: 12,
    color: '#8E8E93',
  },
  requestFare: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6BBF00',
  },
  requestPickup: {
    fontSize: 14,
    color: '#1C1C1E',
    marginBottom: 4,
  },
  requestDropoff: {
    fontSize: 14,
    color: '#1C1C1E',
    marginBottom: 12,
  },
  requestFooter: {
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    paddingTop: 12,
  },
  requestInfo: {
    fontSize: 12,
    color: '#8E8E93',
  },
  noRequests: {
    alignItems: 'center',
    padding: 30,
  },
  noRequestsText: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 8,
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
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  requestDetails: {
    marginBottom: 24,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailText: {
    flex: 1,
    fontSize: 15,
    color: '#1C1C1E',
    marginLeft: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    padding: 16,
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
  },
  statBox: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  statLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
  },
  bidSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  bidLabel: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 12,
  },
  bidInput: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  currencySymbol: {
    fontSize: 28,
    fontWeight: '600',
    color: '#6BBF00',
  },
  bidAmountText: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  bidButtons: {
    flexDirection: 'row',
    gap: 16,
  },
  bidAdjustButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBidButton: {
    marginBottom: 20,
  },
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
  actionButton: {
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
  actionButtons: {},
});
