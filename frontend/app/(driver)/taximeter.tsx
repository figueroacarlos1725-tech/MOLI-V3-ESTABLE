import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  Vibration, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import { apiService } from '@/src/services/api';
import * as Location from 'expo-location';

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
  const [gpsStatus, setGpsStatus] = useState<'waiting' | 'active' | 'error'>('waiting');
  const timerRef = useRef<any>(null);
  const lastPosition = useRef<{ lat: number; lng: number } | null>(null);
  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const webWatchId = useRef<number | null>(null);

  useEffect(() => {
    fetchConfig();
    return () => { stopTracking(); };
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
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const processPosition = (latitude: number, longitude: number) => {
    setGpsStatus('active');
    if (lastPosition.current) {
      const d = haversineDistance(
        lastPosition.current.lat, lastPosition.current.lng,
        latitude, longitude
      );
      // Filter GPS noise: min 3m, max 300m between updates
      if (d > 3 && d < 300) {
        setDistance(prev => prev + d);
      }
    }
    lastPosition.current = { lat: latitude, lng: longitude };
  };

  const startTracking = async () => {
    if (Platform.OS === 'web') {
      // Web fallback
      if (navigator.geolocation) {
        webWatchId.current = navigator.geolocation.watchPosition(
          (pos) => processPosition(pos.coords.latitude, pos.coords.longitude),
          (err) => { console.log('GPS error:', err); setGpsStatus('error'); },
          { enableHighAccuracy: true }
        );
      }
    } else {
      // Native: use expo-location
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setGpsStatus('error');
          return;
        }
        locationSub.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 2000,   // every 2 seconds
            distanceInterval: 5,  // every 5 meters
          },
          (loc) => {
            processPosition(loc.coords.latitude, loc.coords.longitude);
          }
        );
      } catch (e) {
        console.log('Location error:', e);
        setGpsStatus('error');
      }
    }
  };

  const stopTracking = () => {
    // Stop native location
    if (locationSub.current) {
      locationSub.current.remove();
      locationSub.current = null;
    }
    // Stop web location
    if (webWatchId.current !== null && Platform.OS === 'web') {
      navigator.geolocation.clearWatch(webWatchId.current);
      webWatchId.current = null;
    }
    // Stop timer
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
    setGpsStatus('waiting');

    try { Vibration.vibrate(200); } catch (e) {}

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

    try { Vibration.vibrate([200, 100, 200]); } catch (e) {}

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
    setGpsStatus('waiting');
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
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIcon}>
              <Ionicons name="speedometer" size={20} color="#00C853" />
            </View>
            <Text style={styles.headerTitle}>Taxímetro</Text>
          </View>
          {isRunning && (
            <View style={[styles.gpsChip, gpsStatus === 'active' && styles.gpsActive, gpsStatus === 'error' && styles.gpsError]}>
              <View style={[styles.gpsDot, gpsStatus === 'active' && styles.gpsDotActive, gpsStatus === 'error' && styles.gpsDotError]} />
              <Text style={styles.gpsText}>
                {gpsStatus === 'active' ? 'GPS' : gpsStatus === 'error' ? 'Sin GPS' : 'Buscando...'}
              </Text>
            </View>
          )}
        </View>

        {/* Fare Display */}
        <View style={styles.fareSection}>
          <Text style={styles.fareLabel}>TARIFA</Text>
          <Text style={styles.fareAmount}>${fare.toFixed(0)}</Text>
          {isRunning && (
            <View style={styles.statusChip}>
              <View style={[styles.statusDot, isPaused ? styles.pausedDot : styles.runningDot]} />
              <Text style={[styles.statusText, isPaused && styles.pausedText]}>
                {isPaused ? 'PAUSADO' : 'EN CURSO'}
              </Text>
            </View>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="time-outline" size={20} color="#00C853" />
            <Text style={styles.statValue}>{formatTime(elapsedSeconds)}</Text>
            <Text style={styles.statLabel}>Tiempo</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="navigate-outline" size={20} color="#00C853" />
            <Text style={styles.statValue}>{formatDistance(distance)}</Text>
            <Text style={styles.statLabel}>Distancia</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="speedometer-outline" size={20} color="#00C853" />
            <Text style={styles.statValue}>
              {elapsedSeconds > 0 ? ((distance / 1000) / (elapsedSeconds / 3600)).toFixed(1) : '0.0'}
            </Text>
            <Text style={styles.statLabel}>km/h</Text>
          </View>
        </View>

        {/* Config Info */}
        <View style={styles.configInfo}>
          <Text style={styles.configText}>
            Bajada ${config.base_fare} · $/km {config.per_km} · $/min {config.per_min} · Mínimo ${config.min_fare}
          </Text>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          {!isRunning ? (
            <TouchableOpacity style={styles.startBtn} onPress={handleStart} activeOpacity={0.8}>
              <Ionicons name="play" size={36} color="#fff" />
              <Text style={styles.startBtnText}>INICIAR</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.runningControls}>
              {isPaused ? (
                <TouchableOpacity style={styles.resumeBtn} onPress={handleResume} activeOpacity={0.8}>
                  <Ionicons name="play" size={24} color="#fff" />
                  <Text style={styles.controlLabel}>Continuar</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.pauseBtn} onPress={handlePause} activeOpacity={0.8}>
                  <Ionicons name="pause" size={24} color="#1C1C1E" />
                  <Text style={[styles.controlLabel, { color: '#1C1C1E' }]}>Pausar</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.stopBtn} onPress={handleStop} activeOpacity={0.8}>
                <Ionicons name="stop" size={36} color="#fff" />
                <Text style={styles.stopBtnText}>COBRAR</Text>
              </TouchableOpacity>
            </View>
          )}
          {!isRunning && (elapsedSeconds > 0 || fare > 0) && (
            <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
              <Ionicons name="refresh" size={16} color="#8E8E93" />
              <Text style={styles.resetBtnText}>Reiniciar</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* History */}
        {history.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.historyTitle}>Últimos viajes</Text>
            {history.map((h, i) => (
              <View key={i} style={styles.historyItem}>
                <Text style={styles.historyFare}>${h.fare.toFixed(0)}</Text>
                <Text style={styles.historyDetail}>{formatDistance(h.distance)} · {formatTime(h.time)}</Text>
                <Text style={styles.historyDate}>{h.date}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollContent: { paddingBottom: 40 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(0,200,83,0.1)', justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1C1C1E' },
  gpsChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
    backgroundColor: '#F2F2F7',
  },
  gpsActive: { backgroundColor: 'rgba(0,200,83,0.1)' },
  gpsError: { backgroundColor: 'rgba(255,59,48,0.1)' },
  gpsDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#C7C7CC' },
  gpsDotActive: { backgroundColor: '#00C853' },
  gpsDotError: { backgroundColor: '#FF3B30' },
  gpsText: { fontSize: 11, fontWeight: '600', color: '#8E8E93' },

  fareSection: { alignItems: 'center', paddingVertical: 28 },
  fareLabel: { fontSize: 13, fontWeight: '700', color: '#8E8E93', letterSpacing: 2 },
  fareAmount: { fontSize: 72, fontWeight: '800', color: '#1C1C1E', marginTop: 4 },
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 8, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12,
    backgroundColor: 'rgba(0,200,83,0.1)',
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  runningDot: { backgroundColor: '#00C853' },
  pausedDot: { backgroundColor: '#FF9500' },
  statusText: { fontSize: 12, fontWeight: '700', color: '#00C853', letterSpacing: 1 },
  pausedText: { color: '#FF9500' },

  statsRow: {
    flexDirection: 'row', marginHorizontal: 20, gap: 10,
  },
  statCard: {
    flex: 1, alignItems: 'center', gap: 6,
    backgroundColor: '#F8F8F8', borderRadius: 16, paddingVertical: 16,
    borderWidth: 1, borderColor: '#F0F0F0',
  },
  statValue: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  statLabel: { fontSize: 11, color: '#8E8E93', fontWeight: '600' },

  configInfo: {
    marginHorizontal: 20, marginTop: 14, paddingVertical: 8, alignItems: 'center',
  },
  configText: { fontSize: 12, color: '#B0B0B0', fontWeight: '500' },

  controls: { alignItems: 'center', paddingVertical: 24, gap: 16 },
  startBtn: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: '#00C853', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#00C853', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 16, elevation: 8,
  },
  startBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 4 },
  runningControls: { flexDirection: 'row', gap: 20, alignItems: 'center' },
  pauseBtn: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#E5E5EA',
  },
  resumeBtn: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#00C853', justifyContent: 'center', alignItems: 'center',
  },
  controlLabel: { color: '#fff', fontSize: 10, fontWeight: '700', marginTop: 2 },
  stopBtn: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#FF3B30', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  stopBtnText: { color: '#fff', fontSize: 14, fontWeight: '800', marginTop: 4 },
  resetBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  resetBtnText: { color: '#8E8E93', fontSize: 14 },

  historySection: {
    marginHorizontal: 20, paddingTop: 16,
    borderTopWidth: 1, borderTopColor: '#F0F0F0',
  },
  historyTitle: { fontSize: 14, fontWeight: '700', color: '#8E8E93', marginBottom: 10 },
  historyItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F8F8F8',
  },
  historyFare: { fontSize: 16, fontWeight: '700', color: '#00C853', width: 80 },
  historyDetail: { fontSize: 12, color: '#999', flex: 1 },
  historyDate: { fontSize: 11, color: '#CCC' },
});
