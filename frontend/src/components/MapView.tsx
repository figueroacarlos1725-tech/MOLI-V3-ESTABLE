import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Platform } from 'react-native';

interface MarkerProps {
  latitude: number;
  longitude: number;
  title?: string;
  type?: 'pickup' | 'dropoff' | 'driver' | 'user';
}

interface MapViewProps {
  initialRegion?: {
    latitude: number;
    longitude: number;
    latitudeDelta?: number;
    longitudeDelta?: number;
  };
  markers?: MarkerProps[];
  showRoute?: boolean;
  onMapPress?: (coords: { latitude: number; longitude: number }) => void;
  onMarkerDrag?: (markerId: string, coords: { latitude: number; longitude: number }) => void;
  style?: any;
}

const DEFAULT_LAT = -34.6037;
const DEFAULT_LNG = -58.3816;

function generateLeafletHtml(lat: number, lng: number, markers: MarkerProps[], showRoute: boolean, enableClick: boolean) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden}
#map{width:100%;height:100%}
.cm{font-size:28px;text-align:center;line-height:32px;filter:drop-shadow(1px 1px 2px rgba(0,0,0,0.4))}
.leaflet-control-attribution{font-size:8px!important}
.pulse{width:18px;height:18px;border-radius:50%;background:rgba(107,191,0,0.3);border:3px solid #6BBF00;animation:p 2s infinite}
@keyframes p{0%{box-shadow:0 0 0 0 rgba(107,191,0,0.4)}70%{box-shadow:0 0 0 12px rgba(107,191,0,0)}100%{box-shadow:0 0 0 0 rgba(107,191,0,0)}}
</style>
</head>
<body>
<div id="map"></div>
<script>
var map=L.map('map',{zoomControl:true}).setView([${lat},${lng}],15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM',maxZoom:19}).addTo(map);
var mks=[],rl=null;
function iconFor(t){
  if(t==='pickup')return L.divIcon({className:'cm',html:'🟢',iconSize:[32,32],iconAnchor:[16,32]});
  if(t==='dropoff')return L.divIcon({className:'cm',html:'🔴',iconSize:[32,32],iconAnchor:[16,32]});
  if(t==='driver')return L.divIcon({className:'cm',html:'🚗',iconSize:[32,32],iconAnchor:[16,32]});
  return L.divIcon({className:'',html:'<div class="pulse"></div>',iconSize:[18,18],iconAnchor:[9,9]});
}
function setMarkers(arr){
  mks.forEach(function(m){map.removeLayer(m)});mks=[];
  if(rl){map.removeLayer(rl);rl=null}
  arr.forEach(function(m){
    var mk=L.marker([m.latitude,m.longitude],{icon:iconFor(m.type||'user')}).addTo(map);
    if(m.title)mk.bindPopup(m.title);
    mks.push(mk);
  });
  if(${showRoute?'true':'false'}&&arr.length>=2){
    var cs=arr.map(function(m){return[m.latitude,m.longitude]});
    rl=L.polyline(cs,{color:'#6BBF00',weight:5,opacity:0.8,dashArray:'10,10'}).addTo(map);
    map.fitBounds(cs,{padding:[50,50]});
  }
}
var initMarkers=${JSON.stringify(markers)};
if(initMarkers.length>0)setMarkers(initMarkers);
${enableClick?`map.on('click',function(e){
  var msg=JSON.stringify({type:'mapPress',latitude:e.latlng.lat,longitude:e.latlng.lng});
  try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(msg)}catch(x){}
  try{window.parent.postMessage(msg,'*')}catch(x){}
});`:''}
window.updateMarkers=setMarkers;
window.panTo=function(a,b,z){map.setView([a,b],z||15)};
if(navigator.geolocation){
  navigator.geolocation.getCurrentPosition(function(p){
    map.setView([p.coords.latitude,p.coords.longitude],15);
    var msg=JSON.stringify({type:'locationDetected',latitude:p.coords.latitude,longitude:p.coords.longitude});
    try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(msg)}catch(x){}
    try{window.parent.postMessage(msg,'*')}catch(x){}
  },function(){},{ enableHighAccuracy:false,timeout:8000});
}
</script>
</body>
</html>`;
}

function WebMapView({ initialRegion, markers = [], showRoute = false, onMapPress, style }: MapViewProps) {
  const containerRef = useRef<View>(null);
  const iframeRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const lat = initialRegion?.latitude || DEFAULT_LAT;
  const lng = initialRegion?.longitude || DEFAULT_LNG;

  useEffect(() => {
    // On web, we create the iframe programmatically using DOM APIs
    if (Platform.OS !== 'web') return;

    const container = containerRef.current as any;
    if (!container) return;

    // Get the DOM node
    const domNode = container._nativeTag || container;
    let node: HTMLElement | null = null;

    // In React Native Web, View refs expose the DOM element
    if (domNode instanceof HTMLElement) {
      node = domNode;
    } else if (typeof document !== 'undefined') {
      // Fallback: find by data attribute
      setTimeout(() => {
        const el = document.querySelector('[data-map-container="true"]');
        if (el) createIframe(el as HTMLElement);
      }, 100);
      return;
    }

    if (node) {
      createIframe(node);
    }
  }, []);

  const createIframe = useCallback((node: HTMLElement) => {
    // Remove existing iframes
    const existing = node.querySelector('iframe');
    if (existing) existing.remove();

    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.borderRadius = '12px';
    iframe.style.position = 'absolute';
    iframe.style.top = '0';
    iframe.style.left = '0';

    const html = generateLeafletHtml(lat, lng, markers, showRoute, !!onMapPress);
    iframe.srcdoc = html;
    iframeRef.current = iframe;

    iframe.onload = () => {
      setIsLoading(false);
    };

    node.style.position = 'relative';
    node.appendChild(iframe);
  }, [lat, lng, markers, showRoute, onMapPress]);

  // Listen for messages from iframe
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data.type === 'mapPress' && onMapPress) {
          onMapPress({ latitude: data.latitude, longitude: data.longitude });
        }
      } catch (e) {
        // ignore
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onMapPress]);

  // Update markers in iframe
  useEffect(() => {
    if (Platform.OS !== 'web' || !iframeRef.current) return;
    try {
      const win = iframeRef.current.contentWindow;
      if (win && win.updateMarkers) {
        win.updateMarkers(markers);
      }
    } catch (e) {
      // ignore
    }
  }, [markers]);

  return (
    <View
      ref={containerRef}
      style={[styles.container, style]}
      {...({ 'data-map-container': 'true' } as any)}
    >
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6BBF00" />
          <Text style={styles.loadingText}>Cargando mapa...</Text>
        </View>
      )}
    </View>
  );
}

function NativeMapView({ initialRegion, markers = [], showRoute = false, onMapPress, onMarkerDrag, style }: MapViewProps) {
  const WebView = require('react-native-webview').WebView;
  const webViewRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const lat = initialRegion?.latitude || DEFAULT_LAT;
  const lng = initialRegion?.longitude || DEFAULT_LNG;

  const mapHtml = generateLeafletHtml(lat, lng, markers, showRoute, !!onMapPress);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'mapPress' && onMapPress) {
        onMapPress({ latitude: data.latitude, longitude: data.longitude });
      } else if (data.type === 'markerDrag' && onMarkerDrag) {
        onMarkerDrag(data.markerId, { latitude: data.latitude, longitude: data.longitude });
      }
    } catch (error) {
      console.error('Error parsing map message:', error);
    }
  };

  useEffect(() => {
    if (webViewRef.current && markers.length > 0) {
      webViewRef.current.injectJavaScript(`
        if(window.updateMarkers){window.updateMarkers(${JSON.stringify(markers)})}
        true;
      `);
    }
  }, [markers]);

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        source={{ html: mapHtml }}
        style={styles.map}
        onMessage={handleMessage}
        onLoadEnd={() => setIsLoading(false)}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scrollEnabled={false}
        originWhitelist={['*']}
      />
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6BBF00" />
          <Text style={styles.loadingText}>Cargando mapa...</Text>
        </View>
      )}
    </View>
  );
}

export function MapView(props: MapViewProps) {
  if (Platform.OS === 'web') {
    return <WebMapView {...props} />;
  }
  return <NativeMapView {...props} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: '#E8E8E8',
    minHeight: 200,
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
    fontSize: 14,
  },
});
