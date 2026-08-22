import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, ScrollView, Platform, Alert, Animated, Easing,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { apiService } from '@/src/services/api';
import { useAuthStore } from '@/src/stores/authStore';

const GREEN = '#FF7733';

export default function ClientHomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ service?: string }>();
  const isTramite = params.service === 'tramites';
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const webViewRef = useRef<any>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const [latitude, setLatitude] = useState(-28.4696);
  const [longitude, setLongitude] = useState(-65.7852);
  const [address, setAddress] = useState('');
  const [loadingLoc, setLoadingLoc] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [myActiveJobs, setMyActiveJobs] = useState<any[]>([]);

  // Pulse animation for location marker
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Get current location + load active jobs
  useEffect(() => {
    (async () => {
      try {
        const loc = await import('expo-location');
        const { status } = await loc.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await loc.getCurrentPositionAsync({});
          setLatitude(pos.coords.latitude);
          setLongitude(pos.coords.longitude);
          try {
            const r = await apiService.get(`/places/reverse?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`);
            if (r?.address) setAddress(r.address);
          } catch {}
        }
      } catch {}
      setLoadingLoc(false);
    })();
  }, []);

  // Refresh active jobs on focus
  const loadActiveJobs = useCallback(async () => {
    try {
      const res = await apiService.get('/jobs/my-posts');
      const active = (res.jobs || []).filter((j: any) => ['open', 'assigned', 'reviewing', 'in_progress', 'pending_completion'].includes(j.status));
      setMyActiveJobs(active);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { loadActiveJobs(); }, [loadActiveJobs]));

  // Search addresses
  const handleSearch = useCallback(async (text: string) => {
    setSearchText(text);
    if (text.length < 3) { setSuggestions([]); return; }
    setSearching(true);
    try {
      const data = await apiService.get(`/places/search?q=${encodeURIComponent(text)}&lat=${latitude}&lng=${longitude}`);
      setSuggestions(data?.results || []);
    } catch {}
    setSearching(false);
  }, [latitude, longitude]);

  const selectAddress = (item: any) => {
    setLatitude(item.latitude);
    setLongitude(item.longitude);
    setAddress(item.address || item.name);
    setSuggestions([]);
    setShowSearch(false);
    setSearchText('');
    // Update map
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`updatePin(${item.latitude}, ${item.longitude}); true;`);
    }
  };

  const handleMapMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'pin_moved') {
        setLatitude(data.lat);
        setLongitude(data.lng);
        // Reverse geocode
        apiService.get(`/places/reverse?lat=${data.lat}&lng=${data.lng}`).then(r => {
          if (r?.address) setAddress(r.address);
        }).catch(() => {});
      }
    } catch {}
  };

  const handleConfirmLocation = () => {
    router.push({
      pathname: '/(jobs)/request-job',
      params: { lat: String(latitude), lng: String(longitude), addr: address, service: isTramite ? 'tramites' : 'trabajos' },
    } as any);
  };

  const mapHtml = `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>body,html{margin:0;padding:0;height:100%}#map{height:100%;width:100%}</style>
</head><body>
<div id="map"></div>
<script>
var map=L.map('map',{zoomControl:false}).setView([${latitude},${longitude}],15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
var pin=L.marker([${latitude},${longitude}],{draggable:true,icon:L.divIcon({html:'<div style="width:48px;height:48px;border-radius:50%;background:#FF7733;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(255,119,51,0.35);border:3px solid #fff"><svg width=22 height=22 viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><circle cx=12 cy=12 r=3/><path d="M12 2v4m0 12v4m-10-10h4m12 0h4"/></svg></div>',className:'',iconSize:[48,48],iconAnchor:[24,48]})}).addTo(map);
pin.on('dragend',function(e){var ll=e.target.getLatLng();window.ReactNativeWebView.postMessage(JSON.stringify({type:'pin_moved',lat:ll.lat,lng:ll.lng}));});
function updatePin(lat,lng){pin.setLatLng([lat,lng]);map.setView([lat,lng],15);}
</script>
</body></html>`;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.replace('/modules')} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{isTramite ? 'Moli Trámites' : 'Moli Trabajos'}</Text>
        <TouchableOpacity onPress={() => router.push('/(jobs)/client-profile' as any)} style={s.profileBtn}>
          <Ionicons name="person-circle" size={28} color={GREEN} />
        </TouchableOpacity>
      </View>

      {/* Map */}
      <View style={{ flex: 1 }}>
        {Platform.OS === 'web' ? (
          <iframe srcDoc={mapHtml} style={{ width: '100%', height: '100%', border: 'none' } as any} />
        ) : (
          <WebView
            ref={webViewRef}
            source={{ html: mapHtml }}
            onMessage={handleMapMessage}
            style={{ flex: 1 }}
            javaScriptEnabled
          />
        )}
      </View>

      {/* Active jobs banner */}
      {myActiveJobs.length > 0 && (
        <View style={{ backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E5EA', paddingHorizontal: 16, paddingVertical: 10 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#1C1C1E', marginBottom: 8 }}>Mis trabajos activos</Text>
          {myActiveJobs.map((job) => (
            <TouchableOpacity
              key={job.job_id}
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F8FA', borderRadius: 12, padding: 12, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: job.status === 'assigned' ? '#FF7733' : '#FF9500' }}
              onPress={() => router.push({ pathname: '/(jobs)/job-status', params: { jobId: job.job_id } } as any)}
            >
              <Ionicons name={job.status === 'assigned' ? 'checkmark-circle' : 'search'} size={20} color={job.status === 'assigned' ? '#FF7733' : '#FF9500'} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#1C1C1E' }} numberOfLines={1}>{job.title}</Text>
                <Text style={{ fontSize: 12, color: '#8E8E93' }}>{job.status === 'assigned' ? (job.assigned_name || 'Profesional asignado') : 'Buscando...'}</Text>
              </View>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#FF7733' }}>${job.budget}</Text>
              <Ionicons name="chevron-forward" size={18} color="#C7C7CC" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Bottom card */}
      <View style={[s.bottomCard, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={s.cardHandle} />

        {/* Pulse badge */}
        <View style={{ alignItems: 'center', marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Animated.View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: GREEN, transform: [{ scale: pulseAnim }] }} />
            <Text style={{ fontSize: 13, color: GREEN, fontWeight: '700' }}>Esta es tu ubicación</Text>
          </View>
        </View>

        {/* Address display / search */}
        {showSearch ? (
          <View>
            <View style={s.searchRow}>
              <Ionicons name="search" size={18} color="#8E8E93" />
              <TextInput
                style={s.searchInput}
                placeholder="Buscar dirección..."
                placeholderTextColor="#8E8E93"
                value={searchText}
                onChangeText={handleSearch}
                autoFocus
              />
              {searching && <ActivityIndicator size="small" color={GREEN} />}
              <TouchableOpacity onPress={() => { setShowSearch(false); setSuggestions([]); }}>
                <Ionicons name="close-circle" size={20} color="#C7C7CC" />
              </TouchableOpacity>
            </View>
            {suggestions.length > 0 && (
              <ScrollView style={s.sugList} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                {suggestions.map((item, i) => (
                  <TouchableOpacity key={i} style={s.sugItem} onPress={() => selectAddress(item)}>
                    <Ionicons name="location-outline" size={16} color={GREEN} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.sugName} numberOfLines={1}>{item.name}</Text>
                      <Text style={s.sugAddr} numberOfLines={1}>{item.address}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        ) : (
          <TouchableOpacity style={s.addressRow} onPress={() => setShowSearch(true)}>
            <View style={s.addressIcon}>
              <Ionicons name="location" size={20} color={GREEN} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.addressLabel}>Tu ubicación</Text>
              <Text style={s.addressText} numberOfLines={1}>
                {loadingLoc ? 'Detectando...' : address || 'Tocá para buscar dirección'}
              </Text>
            </View>
            <Ionicons name="pencil" size={18} color="#C7C7CC" />
          </TouchableOpacity>
        )}

        <Text style={{ fontSize: 11, color: '#8E8E93', textAlign: 'center', marginTop: 6, marginBottom: 10 }}>
          Podés mover el pin en el mapa o buscar tu dirección
        </Text>

        {/* Confirm button */}
        <TouchableOpacity style={s.confirmBtn} onPress={handleConfirmLocation}>
          <Ionicons name={isTramite ? 'document-text' : 'briefcase'} size={20} color="#fff" />
          <Text style={s.confirmBtnText}>{isTramite ? 'Solicitar un trámite aquí' : 'Solicitar un trabajo aquí'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1C1C1E', flex: 1 },
  profileBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  bottomCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 8 },
  cardHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D1D6', alignSelf: 'center', marginBottom: 12 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F8F8FA', borderRadius: 14, padding: 14 },
  addressIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFF0EC', justifyContent: 'center', alignItems: 'center' },
  addressLabel: { fontSize: 11, color: '#8E8E93', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  addressText: { fontSize: 14, color: '#1C1C1E', fontWeight: '600', marginTop: 2 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F2F2F7', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, color: '#1C1C1E' },
  sugList: { maxHeight: 200, marginTop: 4, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E5EA' },
  sugItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  sugName: { fontSize: 14, fontWeight: '600', color: '#1C1C1E' },
  sugAddr: { fontSize: 12, color: '#8E8E93' },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#FF7733', borderRadius: 14, paddingVertical: 18 },
  confirmBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
