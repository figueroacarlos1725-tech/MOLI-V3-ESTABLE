import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/src/services/api';

const ACCENT = '#7B2D8E';
const GREEN = '#34C759';
const DARK = '#1A1D23';

interface NavigationStep {
  instruction: string;
  distance: string;
  duration: string;
  maneuver: string;
}

interface Props {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  height?: number;
  onClose?: () => void;
}

const MANEUVER_ICONS: Record<string, string> = {
  'turn-left': 'arrow-back',
  'turn-right': 'arrow-forward',
  'straight': 'arrow-up',
  'arrive': 'flag',
  'depart': 'navigate',
  'roundabout': 'sync',
  'merge': 'git-merge',
  'fork': 'git-branch',
  'end of road': 'flag',
  '': 'navigate',
};

export default function NavigationView({ originLat, originLng, destLat, destLng, height = 300, onClose }: Props) {
  const [route, setRoute] = useState<number[][]>([]);
  const [steps, setSteps] = useState<NavigationStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [distance, setDistance] = useState('');
  const [duration, setDuration] = useState('');
  const [provider, setProvider] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const iframeRef = useRef<any>(null);

  useEffect(() => {
    const fetchRoute = async () => {
      try {
        setLoading(true);
        const data = await apiService.get(
          `/navigation/route?origin_lat=${originLat}&origin_lng=${originLng}&dest_lat=${destLat}&dest_lng=${destLng}`
        );
        setRoute(data.route || []);
        setSteps(data.steps || []);
        setDistance(`${data.distance_km} km`);
        setDuration(`${Math.round(data.duration_min)} min`);
        setProvider(data.provider);
      } catch (e: any) {
        setError(e.message || 'Error cargando ruta');
      } finally {
        setLoading(false);
      }
    };
    if (destLat && destLng) fetchRoute();
  }, [originLat, originLng, destLat, destLng]);

  const getManeuverIcon = (maneuver: string) => {
    return MANEUVER_ICONS[maneuver] || MANEUVER_ICONS[''];
  };

  const generateMapHtml = () => {
    const routeJson = JSON.stringify(route);
    const stepsJson = JSON.stringify(steps);
    return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
body{margin:0}
#map{width:100%;height:100vh}
</style></head><body>
<div id="map"></div>
<script>
var route=${routeJson};
var map=L.map('map',{zoomControl:false});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);

// Route polyline
if(route.length>0){
  var line=L.polyline(route,{color:'#7B2D8E',weight:5,opacity:0.8}).addTo(map);
  map.fitBounds(line.getBounds(),{padding:[30,30]});
  
  // Start marker
  L.circleMarker(route[0],{radius:8,color:'#34C759',fillColor:'#34C759',fillOpacity:1,weight:2}).addTo(map);
  
  // End marker
  L.circleMarker(route[route.length-1],{radius:8,color:'#FF3B30',fillColor:'#FF3B30',fillOpacity:1,weight:2}).addTo(map);
}
</script></body></html>`;
  };

  if (loading) {
    return (
      <View style={[s.container, { height, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={ACCENT} />
        <Text style={s.loadingText}>Calculando ruta...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[s.container, { height, justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="warning" size={32} color="#FF9500" />
        <Text style={s.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Map */}
      <View style={[s.mapContainer, { height: height - 120 }]}>
        {Platform.OS === 'web' ? (
          <iframe
            ref={iframeRef}
            srcDoc={generateMapHtml()}
            style={{ width: '100%', height: '100%', border: 'none', borderRadius: 12 } as any}
            title="navigation-map"
          />
        ) : (
          (() => {
            try {
              const { WebView } = require('react-native-webview');
              return <WebView source={{ html: generateMapHtml() }} style={{ flex: 1, borderRadius: 12 }} javaScriptEnabled />;
            } catch { return null; }
          })()
        )}

        {/* Close button */}
        {onClose && (
          <TouchableOpacity style={s.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Info pill */}
        <View style={s.infoPill}>
          <Text style={s.infoDistance}>{distance}</Text>
          <View style={s.infoDot} />
          <Text style={s.infoDuration}>{duration}</Text>
          <View style={s.infoDot} />
          <Text style={s.infoProvider}>{provider === 'google' ? 'Google' : 'Mapbox'}</Text>
        </View>
      </View>

      {/* Current step */}
      {steps.length > 0 && (
        <View style={s.stepCard}>
          <View style={s.stepIconBox}>
            <Ionicons name={getManeuverIcon(steps[currentStep]?.maneuver) as any} size={22} color="#fff" />
          </View>
          <View style={s.stepContent}>
            <Text style={s.stepInstruction} numberOfLines={2}>{steps[currentStep]?.instruction}</Text>
            <Text style={s.stepMeta}>{steps[currentStep]?.distance} · {steps[currentStep]?.duration}</Text>
          </View>
          <View style={s.stepNav}>
            {currentStep > 0 && (
              <TouchableOpacity onPress={() => setCurrentStep(p => p - 1)}>
                <Ionicons name="chevron-back" size={22} color="#8E8E93" />
              </TouchableOpacity>
            )}
            <Text style={s.stepCount}>{currentStep + 1}/{steps.length}</Text>
            {currentStep < steps.length - 1 && (
              <TouchableOpacity onPress={() => setCurrentStep(p => p + 1)}>
                <Ionicons name="chevron-forward" size={22} color="#8E8E93" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { borderRadius: 12, overflow: 'hidden', backgroundColor: DARK },
  mapContainer: { position: 'relative', borderRadius: 12, overflow: 'hidden' },
  closeBtn: {
    position: 'absolute', top: 8, right: 8, width: 32, height: 32,
    borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center',
  },
  infoPill: {
    position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, gap: 6,
  },
  infoDistance: { color: '#fff', fontSize: 12, fontWeight: '800' },
  infoDuration: { color: '#34C759', fontSize: 12, fontWeight: '700' },
  infoProvider: { color: '#8E8E93', fontSize: 10, fontWeight: '600' },
  infoDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#555' },
  stepCard: {
    flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10,
    backgroundColor: '#22262E', borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
  },
  stepIconBox: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: ACCENT,
    justifyContent: 'center', alignItems: 'center',
  },
  stepContent: { flex: 1 },
  stepInstruction: { fontSize: 13, fontWeight: '600', color: '#E5E5EA', lineHeight: 18 },
  stepMeta: { fontSize: 11, color: '#8E8E93', marginTop: 2 },
  stepNav: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepCount: { fontSize: 11, color: '#636366', fontWeight: '600' },
  loadingText: { color: '#8E8E93', fontSize: 13, marginTop: 8 },
  errorText: { color: '#FF9500', fontSize: 13, marginTop: 8 },
});
