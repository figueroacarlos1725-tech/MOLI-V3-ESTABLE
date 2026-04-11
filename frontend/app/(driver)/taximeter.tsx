import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  Vibration, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import { apiService } from '@/src/services/api';

interface TaxiConfig {
  base_fare: number;
  per_km: number;
  per_min: number;
  min_fare: number;
}

const DEFAULT_CONFIG: TaxiConfig = {
  base_fare: 500,
  per_km: 150,
  per_min: 50,
  min_fare: 800,
};

export default function TaximeterScreen() {
  const { user } = useAuthStore();
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [distance, setDistance] = useState(0); // in meters
  const [fare, setFare] = useState(0);
  const [config, setConfig] = useState<TaxiConfig>(DEFAULT_CONFIG);
  const [history, setHistory] = useState<any[]>([]);
  const timerRef = useRef<any>(null);
  const lastPosition = useRef<{ lat: number; lng: number } | null>(null);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    fetchConfig();
    return () => {
      stopTracking();
    };
  }, []);

  useEffect(() => {
    calculateFare();
  }, [elapsedSeconds, distance]);

  const fetchConfig = async () => {
    try {
      const r = await apiService.get('/fares');
      const eco = (r.fares || []).find((f: any) => f.vehicle_type === 'economy');
      if (eco) {
        setConfig({
          base_fare: eco.base_fare || 500,
          per_km: eco.per_km || 150,
          per_min: eco.per_min || 50,
          min_fare: eco.min_fare || 800,
        });
      }
    } catch (e) {
      console.log('Using default taximeter config');
    }
  };

  const calculateFare = useCallback(() => {
    const km = distance / 1000;
    const min = elapsedSeconds / 60;
    const calculated = config.base_fare + (km * config.per_km) + (min * config.per_min);
    setFare(Math.max(calculated, isRunning ? 0 : config.min_fare));
  }, [distance, elapsedSeconds, config, isRunning]);

  const haversineDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng/2) * Math.sin(dLng/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const startTracking = () => {
    if (Platform.OS === 'web' && navigator.geolocation) {
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          if (lastPosition.current) {
            const d = haversineDistance(
              lastPosition.current.lat, lastPosition.current.lng,
              latitude, longitude
            );
            if (d > 5 && d < 500) { // Filter noise (5m-500m)
              setDistance(prev => prev + d);
            }
          }
          lastPosition.current = { lat: latitude, lng: longitude };
        },
        (err) => console.log('GPS error:', err),
        { enableHighAccuracy: true, distanceFilter: 10 }
      );
    }
  };

  const stopTracking = () => {
    if (watchId.current !== null && Platform.OS === 'web') {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleStart = () => {
    setIsRunning(true);
    setIsPaused(false);
    setElapsedSeconds(0);
    setDistance(0);
    setFare(0);
    lastPosition.current = null;
    
    if (Platform.OS !== 'web') Vibration.vibrate(200);
    
    timerRef.current = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    
    startTracking();
  };

  const handlePause = () => {
    setIsPaused(true);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleResume = () => {
    setIsPaused(false);
    timerRef.current = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
  };

  const handleStop = () => {
    stopTracking();
    const finalFare = Math.max(fare, config.min_fare);
    setFare(finalFare);
    setIsRunning(false);
    setIsPaused(false);
    
    if (Platform.OS !== 'web') Vibration.vibrate([200, 100, 200]);
    
    // Add to history
    setHistory(prev => [{
      fare: finalFare,
      distance: distance,
      time: elapsedSeconds,
      date: new Date().toLocaleString('es-AR'),
    }, ...prev.slice(0, 9)]);
  };

  const handleReset = () => {
    stopTracking();
    setIsRunning(false);
    setIsPaused(false);
    setElapsedSeconds(0);
    setDistance(0);
    setFare(0);
    lastPosition.current = null;
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatDistance = (meters: number) => {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(2)} km`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="speedometer" size={24} color="#A855F7" />
        <Text style={styles.headerTitle}>Taximetro</Text>
      </View>

      {/* Fare Display */}
      <View style={styles.fareSection}>
        <Text style={styles.fareLabel}>TARIFA</Text>
        <Text style={styles.fareAmount}>${fare.toFixed(0)}</Text>
        {isRunning && <View style={[styles.runningDot, isPaused && styles.pausedDot]} />}
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Ionicons name="time-outline" size={22} color="#3B82F6" />
          <Text style={styles.statValue}>{formatTime(elapsedSeconds)}</Text>
          <Text style={styles.statLabel}>Tiempo</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Ionicons name="navigate-outline" size={22} color="#F59E0B" />
          <Text style={styles.statValue}>{formatDistance(distance)}</Text>
          <Text style={styles.statLabel}>Distancia</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Ionicons name="speedometer-outline" size={22} color="#8B5CF6" />
          <Text style={styles.statValue}>
            {elapsedSeconds > 0 ? ((distance / 1000) / (elapsedSeconds / 3600)).toFixed(1) : '0.0'}
          </Text>
          <Text style={styles.statLabel}>km/h</Text>
        </View>
      </View>

      {/* Config Info */}
      <View style={styles.configInfo}>
        <Text style={styles.configText}>
          Base: ${config.base_fare} | $/km: ${config.per_km} | $/min: ${config.per_min} | Min: ${config.min_fare}
        </Text>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {!isRunning ? (
          <TouchableOpacity style={styles.startBtn} onPress={handleStart}>
            <Ionicons name="play" size={36} color="#fff" />
            <Text style={styles.startBtnText}>INICIAR</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.runningControls}>
            {isPaused ? (
              <TouchableOpacity style={styles.resumeBtn} onPress={handleResume}>
                <Ionicons name="play" size={28} color="#fff" />
                <Text style={styles.controlBtnText}>Continuar</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.pauseBtn} onPress={handlePause}>
                <Ionicons name="pause" size={28} color="#fff" />
                <Text style={styles.controlBtnText}>Pausar</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.stopBtn} onPress={handleStop}>
              <Ionicons name="stop" size={36} color="#fff" />
              <Text style={styles.stopBtnText}>FINALIZAR</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {!isRunning && (elapsedSeconds > 0 || fare > 0) && (
          <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
            <Ionicons name="refresh" size={18} color="#8E8E93" />
            <Text style={styles.resetBtnText}>Reiniciar</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* History */}
      {history.length > 0 && (
        <View style={styles.historySection}>
          <Text style={styles.historyTitle}>Ultimos viajes</Text>
          {history.map((h, i) => (
            <View key={i} style={styles.historyItem}>
              <Text style={styles.historyFare}>${h.fare.toFixed(0)}</Text>
              <Text style={styles.historyDetail}>{formatDistance(h.distance)} - {formatTime(h.time)}</Text>
              <Text style={styles.historyDate}>{h.date}</Text>
            </View>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  fareSection: {
    alignItems: 'center', paddingVertical: 30,
    position: 'relative',
  },
  fareLabel: { fontSize: 14, fontWeight: '700', color: '#8E8E93', letterSpacing: 2 },
  fareAmount: { fontSize: 72, fontWeight: '800', color: '#A855F7', marginTop: 4 },
  runningDot: {
    position: 'absolute', top: 30, right: 40,
    width: 14, height: 14, borderRadius: 7, backgroundColor: '#10B981',
  },
  pausedDot: { backgroundColor: '#F59E0B' },
  statsRow: {
    flexDirection: 'row', marginHorizontal: 20,
    backgroundColor: '#1A1A1A', borderRadius: 16, padding: 16,
  },
  statBox: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 20, fontWeight: '700', color: '#fff' },
  statLabel: { fontSize: 11, color: '#8E8E93', fontWeight: '600' },
  statDivider: { width: 1, backgroundColor: '#333', marginVertical: 4 },
  configInfo: {
    marginHorizontal: 20, marginTop: 12, paddingVertical: 8,
    alignItems: 'center',
  },
  configText: { fontSize: 11, color: '#666', fontWeight: '500' },
  controls: {
    alignItems: 'center', paddingVertical: 24, gap: 16,
  },
  startBtn: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: '#A855F7', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#A855F7', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  startBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 4 },
  runningControls: { flexDirection: 'row', gap: 20, alignItems: 'center' },
  pauseBtn: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#F59E0B', justifyContent: 'center', alignItems: 'center',
  },
  resumeBtn: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center',
  },
  controlBtnText: { color: '#fff', fontSize: 10, fontWeight: '700', marginTop: 2 },
  stopBtn: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#EF4444', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  stopBtnText: { color: '#fff', fontSize: 14, fontWeight: '800', marginTop: 4 },
  resetBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  resetBtnText: { color: '#8E8E93', fontSize: 14 },
  historySection: {
    marginHorizontal: 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#222',
  },
  historyTitle: { fontSize: 14, fontWeight: '700', color: '#8E8E93', marginBottom: 8 },
  historyItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1A1A1A',
  },
  historyFare: { fontSize: 16, fontWeight: '700', color: '#A855F7', width: 80 },
  historyDetail: { fontSize: 12, color: '#999', flex: 1 },
  historyDate: { fontSize: 11, color: '#666' },
});
