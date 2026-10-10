import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Image,
  ActivityIndicator, ScrollView, Platform, Animated, Easing, useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { apiService } from '@/src/services/api';

const ORANGE = '#FF5A1F';
const ORANGE_DARK = '#E9480B';
const CHARCOAL = '#202124';
const PAPERWORK_ART = require('../../assets/modules/paperwork.png');
const VERIFIED_ART = require('../../assets/professions/verified-tools.png');
const PROFILE_ART = require('../../assets/professions/technician.png');

export default function ClientHomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ service?: string }>();
  const isTramite = params.service === 'tramites';
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 430;
  const webViewRef = useRef<any>(null);
  const mapFrameRef = useRef<any>(null);
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
        const pos = await Promise.race([
          (async () => {
            const loc = await import('expo-location');
            const { status } = await loc.requestForegroundPermissionsAsync();
            return status === 'granted' ? loc.getCurrentPositionAsync({}) : null;
          })(),
          new Promise<null>(resolve => setTimeout(() => resolve(null), 5000)),
        ]);
        if (pos) {
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
      if (data.type === 'pin_moved' && Number.isFinite(data.lat) && Number.isFinite(data.lng)
          && Math.abs(data.lat) <= 90 && Math.abs(data.lng) <= 180) {
        setLatitude(data.lat);
        setLongitude(data.lng);
        // Reverse geocode
        apiService.get(`/places/reverse?lat=${data.lat}&lng=${data.lng}`).then(r => {
          if (r?.address) setAddress(r.address);
        }).catch(() => {});
      }
    } catch {}
  };

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const receive = (event: MessageEvent) => {
      if (event.source !== mapFrameRef.current?.contentWindow || typeof event.data !== 'string') return;
      handleMapMessage({ nativeEvent: { data: event.data } });
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);

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
<style>
*{box-sizing:border-box}body,html{margin:0;padding:0;height:100%;background:#F5F1EB}#map{height:100%;width:100%}
.leaflet-control-attribution{font:9px system-ui!important;opacity:.58;border-radius:10px 0 0 0!important}
.leaflet-control-zoom{border:0!important;box-shadow:0 6px 18px rgba(32,33,36,.16)!important;margin:14px!important}
.leaflet-control-zoom a{width:38px!important;height:38px!important;line-height:36px!important;color:#202124!important;border-color:#F0E3D9!important}
.moli-pin-wrap{width:68px;height:78px;position:relative;filter:drop-shadow(0 9px 9px rgba(120,42,9,.30))}
.moli-pin-pulse{position:absolute;width:58px;height:58px;left:5px;top:3px;border-radius:50%;border:3px solid rgba(255,90,31,.34);animation:moliPulse 1.8s ease-out infinite}
.moli-pin{position:absolute;width:53px;height:53px;left:8px;top:5px;background:linear-gradient(145deg,#FF8A52,#FF5A1F 56%,#E9480B);transform:rotate(45deg);border-radius:50% 50% 50% 13px;border:3px solid #fff;box-shadow:inset 2px 2px 5px rgba(255,255,255,.42)}
.moli-pin-core{position:absolute;width:28px;height:28px;left:20px;top:18px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;z-index:2;box-shadow:0 2px 5px rgba(80,25,4,.18)}
.moli-pin-dot{width:10px;height:10px;border-radius:50%;background:#FF5A1F;border:2px solid #FFD1BB}
.moli-pin-shadow{position:absolute;bottom:0;left:20px;width:29px;height:8px;border-radius:50%;background:rgba(32,33,36,.18);filter:blur(2px)}
@keyframes moliPulse{0%{transform:scale(.72);opacity:1}100%{transform:scale(1.5);opacity:0}}
</style>
</head><body>
<div id="map"></div>
<script>
var map=L.map('map',{zoomControl:true}).setView([${latitude},${longitude}],15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
var pin=L.marker([${latitude},${longitude}],{draggable:true,icon:L.divIcon({html:'<div class="moli-pin-wrap"><div class="moli-pin-pulse"></div><div class="moli-pin"></div><div class="moli-pin-core"><div class="moli-pin-dot"></div></div><div class="moli-pin-shadow"></div></div>',className:'',iconSize:[68,78],iconAnchor:[34,69]})}).addTo(map);
function sendPin(ll){var payload=JSON.stringify({type:'pin_moved',lat:ll.lat,lng:ll.lng});if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(payload);}else{window.parent.postMessage(payload,'*');}}
pin.on('dragend',function(e){sendPin(e.target.getLatLng());});
map.on('click',function(e){pin.setLatLng(e.latlng);sendPin(e.latlng);});
function updatePin(lat,lng){pin.setLatLng([lat,lng]);map.setView([lat,lng],15);}
</script>
</body></html>`;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.replace('/modules')} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={CHARCOAL} />
        </TouchableOpacity>
        <View style={s.headerIdentity}><Image source={isTramite ? PAPERWORK_ART : VERIFIED_ART} style={s.headerModuleIcon} resizeMode="contain"/><View><Text style={s.headerKicker}>MOLI</Text><Text style={s.headerTitle}>{isTramite ? 'Trámites' : 'Profesionales'}</Text></View></View>
        <TouchableOpacity onPress={() => router.push('/(jobs)/client-profile' as any)} style={s.profileBtn}>
          <Image source={PROFILE_ART} style={s.profileImage} resizeMode="cover"/><View style={s.profileDot}/>
        </TouchableOpacity>
      </View>

      {/* Map */}
      <View style={{ flex: 1 }}>
        {Platform.OS === 'web' ? (
          <iframe ref={mapFrameRef} title="Elegí el lugar del servicio" srcDoc={mapHtml} style={{ width: '100%', height: '100%', border: 'none' } as any} />
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
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F8FA', borderRadius: 12, padding: 12, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: job.status === 'assigned' ? ORANGE : '#FF9500' }}
              onPress={() => router.push({ pathname: '/(jobs)/job-status', params: { jobId: job.job_id } } as any)}
            >
              <Ionicons name={job.status === 'assigned' ? 'checkmark-circle' : 'search'} size={20} color={job.status === 'assigned' ? ORANGE : '#FF9500'} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#1C1C1E' }} numberOfLines={1}>{job.title}</Text>
                <Text style={{ fontSize: 12, color: '#8E8E93' }}>{job.status === 'assigned' ? (job.assigned_name || 'Profesional asignado') : 'Buscando...'}</Text>
              </View>
              <Text style={{ fontSize: 15, fontWeight: '700', color: ORANGE }}>${job.budget}</Text>
              <Ionicons name="chevron-forward" size={18} color="#C7C7CC" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Bottom card */}
      <View style={[s.bottomCard, !compact&&s.bottomCardWide, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={s.cardHandle} />

        {/* Pulse badge */}
        <View style={s.locationStatus}>
          <View style={s.locationPill}>
            <Animated.View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: ORANGE, transform: [{ scale: pulseAnim }] }} />
            <Text style={s.locationStatusText}>UBICACIÓN DEL SERVICIO</Text>
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
              {searching && <ActivityIndicator size="small" color={ORANGE} />}
              <TouchableOpacity onPress={() => { setShowSearch(false); setSuggestions([]); }}>
                <Ionicons name="close-circle" size={20} color="#C7C7CC" />
              </TouchableOpacity>
            </View>
            {suggestions.length > 0 && (
              <ScrollView style={s.sugList} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                {suggestions.map((item, i) => (
                  <TouchableOpacity key={i} style={s.sugItem} onPress={() => selectAddress(item)}>
                    <Ionicons name="location-outline" size={16} color={ORANGE} />
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
              <Ionicons name="location" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.addressLabel}>Tu ubicación</Text>
              <Text style={s.addressText} numberOfLines={1}>
                {loadingLoc ? 'Detectando...' : address || 'Tocá para buscar dirección'}
              </Text>
            </View>
            <View style={s.editButton}><Ionicons name="pencil" size={16} color={ORANGE} /></View>
          </TouchableOpacity>
        )}

        <Text style={s.locationHint}>
          Podés mover el pin en el mapa o buscar tu dirección
        </Text>

        {/* Confirm button */}
        <TouchableOpacity activeOpacity={.84} style={s.confirmBtn} onPress={handleConfirmLocation}>
          <View style={s.confirmIcon}><Ionicons name={isTramite ? 'document-text' : 'briefcase'} size={20} color={ORANGE} /></View>
          <Text style={s.confirmBtnText}>{isTramite ? 'Solicitar un trámite aquí' : 'Solicitar un trabajo aquí'}</Text>
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF8F2' },
  header: { minHeight: 74, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#FFF8F2', borderBottomWidth: 1, borderBottomColor: '#F0DFD2', gap: 12, shadowColor: '#68412C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: .08, shadowRadius: 8, elevation: 4, zIndex: 5 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#F0DFD2', shadowColor: '#68412C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: .12, shadowRadius: 7, elevation: 4 },
  headerIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  headerModuleIcon: { width: 48, height: 48 },
  headerKicker: { color: ORANGE, fontSize: 9, lineHeight: 11, fontWeight: '900', letterSpacing: 1.2 },
  headerTitle: { fontSize: 18, lineHeight: 22, fontWeight: '900', color: CHARCOAL },
  profileBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: ORANGE, shadowColor: '#68412C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: .16, shadowRadius: 7, elevation: 5 },
  profileImage: { width: 40, height: 40, borderRadius: 20 },
  profileDot: { position: 'absolute', right: -1, bottom: 1, width: 12, height: 12, borderRadius: 6, backgroundColor: '#22BF60', borderWidth: 2, borderColor: '#fff' },
  bottomCard: { width: '100%', backgroundColor: '#FFFDFC', borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 18, paddingTop: 11, borderWidth: 1, borderBottomWidth: 0, borderColor: '#F0DFD2', shadowColor: '#5D3824', shadowOffset: { width: 0, height: -8 }, shadowOpacity: .16, shadowRadius: 18, elevation: 12 },
  bottomCardWide: { maxWidth: 760, alignSelf: 'center', borderTopRightRadius: 30, borderTopLeftRadius: 30 },
  cardHandle: { width: 46, height: 5, borderRadius: 3, backgroundColor: '#DDCFC5', alignSelf: 'center', marginBottom: 10 },
  locationStatus: { alignItems: 'center', marginBottom: 11 },
  locationPill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#FFF1E8', borderRadius: 16 },
  locationStatusText: { fontSize: 10, color: ORANGE_DARK, fontWeight: '900', letterSpacing: .8 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 20, padding: 12, borderWidth: 1, borderColor: '#F0E1D6', shadowColor: '#6E432B', shadowOffset: { width: 0, height: 5 }, shadowOpacity: .1, shadowRadius: 9, elevation: 4 },
  addressIcon: { width: 47, height: 47, borderRadius: 16, backgroundColor: ORANGE, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 3, borderBottomColor: ORANGE_DARK, shadowColor: ORANGE_DARK, shadowOffset: { width: 0, height: 3 }, shadowOpacity: .24, shadowRadius: 5, elevation: 4 },
  addressLabel: { fontSize: 10, color: ORANGE_DARK, fontWeight: '900', textTransform: 'uppercase', letterSpacing: .75 },
  addressText: { fontSize: 14, color: CHARCOAL, fontWeight: '800', marginTop: 3 },
  editButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF1E8' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 13, borderWidth: 1, borderColor: '#F0DFD2', shadowColor: '#6E432B', shadowOffset: { width: 0, height: 5 }, shadowOpacity: .11, shadowRadius: 9, elevation: 4 },
  searchInput: { flex: 1, fontSize: 15, color: CHARCOAL, fontWeight: '600' },
  sugList: { maxHeight: 200, marginTop: 7, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#EDDED3' },
  sugItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F4ECE6' },
  sugName: { fontSize: 14, fontWeight: '700', color: CHARCOAL },
  sugAddr: { fontSize: 12, color: '#85878A' },
  locationHint: { fontSize: 10, color: '#8A8D91', textAlign: 'center', marginTop: 9, marginBottom: 11 },
  confirmBtn: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: ORANGE, borderRadius: 22, paddingHorizontal: 12, borderWidth: 2, borderColor: '#FF9361', borderBottomWidth: 5, borderBottomColor: ORANGE_DARK, shadowColor: ORANGE_DARK, shadowOffset: { width: 0, height: 7 }, shadowOpacity: .3, shadowRadius: 9, elevation: 8 },
  confirmIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', shadowColor: '#9B3108', shadowOffset: { width: 0, height: 3 }, shadowOpacity: .2, shadowRadius: 4, elevation: 3 },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '900', flexShrink: 1 },
});
