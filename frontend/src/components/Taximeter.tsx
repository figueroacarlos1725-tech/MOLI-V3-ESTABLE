import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Vibration, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

const ACCENT = '#7B2D8E';
const GREEN = '#34C759';
const ORANGE = '#FF9500';
const RED = '#FF3B30';

interface TaximeterConfig {
  base_fare: number;      // Bajada de bandera
  per_km: number;         // $ por km recorrido
  per_wait_min: number;   // $ por minuto de espera (< 5 km/h)
  currency: string;
}

interface TaximeterProps {
  config: TaximeterConfig;
  isActive: boolean;       // true cuando el viaje está "started"
  onFareUpdate?: (fare: number, distance: number, waitTime: number) => void;
  onFinish?: (finalFare: number, distance: number, duration: number, waitTime: number) => void;
}

export default function Taximeter({ config, isActive, onFareUpdate, onFinish }: TaximeterProps) {
  const [distance, setDistance] = useState(0);         // km
  const [waitTime, setWaitTime] = useState(0);         // seconds
  const [elapsed, setElapsed] = useState(0);           // seconds
  const [speed, setSpeed] = useState(0);               // km/h
  const [fare, setFare] = useState(config.base_fare);
  const [isWaiting, setIsWaiting] = useState(false);
  const lastPosition = useRef<{ lat: number; lng: number } | null>(null);
  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<any>(null);
  const startTimeRef = useRef<number>(Date.now());

  // Calculate fare
  const calcFare = useCallback((dist: number, wait: number) => {
    const distFare = dist * config.per_km;
    const waitFare = (wait / 60) * config.per_wait_min;
    return Math.round(config.base_fare + distFare + waitFare);
  }, [config]);

  // Haversine distance
  const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // Start GPS tracking
  useEffect(() => {
    if (!isActive) return;
    startTimeRef.current = Date.now();

    const startTracking = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        locationSub.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 2000,
            distanceInterval: 5,
          },
          (loc) => {
            const { latitude, longitude, speed: spd } = loc.coords;
            const currentSpeed = (spd || 0) * 3.6; // m/s to km/h
            setSpeed(Math.max(0, currentSpeed));

            if (currentSpeed < 5) {
              setIsWaiting(true);
            } else {
              setIsWaiting(false);
            }

            if (lastPosition.current) {
              const d = haversine(
                lastPosition.current.lat, lastPosition.current.lng,
                latitude, longitude
              );
              if (d > 0.005 && d < 1) { // Between 5m and 1km (filter GPS noise)
                setDistance(prev => prev + d);
              }
            }
            lastPosition.current = { lat: latitude, lng: longitude };
          }
        );
      } catch (e) {
        console.error('Taximeter GPS error:', e);
      }
    };

    startTracking();

    // Timer for elapsed + wait time
    timerRef.current = setInterval(() => {
      setElapsed(prev => prev + 1);
      setIsWaiting(prev => {
        // This is a workaround - we check current speed via state
        return prev; // Actual waiting state is set by GPS callback
      });
    }, 1000);

    return () => {
      if (locationSub.current) locationSub.current.remove();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive]);

  // Track wait time separately
  useEffect(() => {
    if (!isActive) return;
    const waitTimer = setInterval(() => {
      if (isWaiting) {
        setWaitTime(prev => prev + 1);
      }
    }, 1000);
    return () => clearInterval(waitTimer);
  }, [isActive, isWaiting]);

  // Update fare on distance/wait changes
  useEffect(() => {
    const newFare = calcFare(distance, waitTime);
    setFare(newFare);
    onFareUpdate?.(newFare, distance, waitTime);
  }, [distance, waitTime, calcFare]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleFinish = () => {
    const finalFare = calcFare(distance, waitTime);
    if (Platform.OS !== 'web') Vibration.vibrate(200);
    onFinish?.(finalFare, distance, elapsed, waitTime);
  };

  return (
    <View style={s.container}>
      {/* Fare display */}
      <View style={s.fareSection}>
        <Text style={s.fareLabel}>TAXÍMETRO</Text>
        <Text style={s.fareAmount}>${fare.toLocaleString('es-AR')}</Text>
        <View style={[s.statusPill, isWaiting ? s.statusWaiting : s.statusMoving]}>
          <Ionicons name={isWaiting ? 'pause' : 'speedometer'} size={12} color="#fff" />
          <Text style={s.statusText}>{isWaiting ? 'Espera' : `${speed.toFixed(0)} km/h`}</Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={s.statsRow}>
        <View style={s.statBox}>
          <Ionicons name="navigate" size={16} color={ACCENT} />
          <Text style={s.statValue}>{distance.toFixed(2)} km</Text>
          <Text style={s.statLabel}>Distancia</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statBox}>
          <Ionicons name="time" size={16} color={GREEN} />
          <Text style={s.statValue}>{formatTime(elapsed)}</Text>
          <Text style={s.statLabel}>Tiempo total</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statBox}>
          <Ionicons name="hourglass" size={16} color={ORANGE} />
          <Text style={s.statValue}>{formatTime(waitTime)}</Text>
          <Text style={s.statLabel}>Espera</Text>
        </View>
      </View>

      {/* Fare breakdown */}
      <View style={s.breakdownRow}>
        <View style={s.breakdownItem}>
          <Text style={s.breakdownLabel}>Bajada</Text>
          <Text style={s.breakdownValue}>${config.base_fare}</Text>
        </View>
        <View style={s.breakdownItem}>
          <Text style={s.breakdownLabel}>Distancia</Text>
          <Text style={s.breakdownValue}>${Math.round(distance * config.per_km)}</Text>
        </View>
        <View style={s.breakdownItem}>
          <Text style={s.breakdownLabel}>Espera</Text>
          <Text style={s.breakdownValue}>${Math.round((waitTime / 60) * config.per_wait_min)}</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: '#1A1D23',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    borderTopWidth: 2,
    borderTopColor: ACCENT,
  },
  fareSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  fareLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: ACCENT,
    letterSpacing: 3,
    marginBottom: 4,
  },
  fareAmount: {
    fontSize: 48,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
  },
  statusMoving: { backgroundColor: GREEN },
  statusWaiting: { backgroundColor: ORANGE },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#22262E',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#333',
    marginHorizontal: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#E5E5EA',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  breakdownItem: {
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: 10,
    color: '#8E8E93',
    fontWeight: '600',
  },
  breakdownValue: {
    fontSize: 14,
    color: '#E5E5EA',
    fontWeight: '700',
  },
});
