import React, { useRef, useCallback, useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';

interface Props {
  latitude: number;
  longitude: number;
  onLocationChange?: (lat: number, lng: number) => void;
  height?: number;
  markerColor?: string;
}

export default function DispatchMapPicker({ latitude, longitude, onLocationChange, height = 180, markerColor = '#7B2D8E' }: Props) {
  const iframeRef = useRef<any>(null);
  const callbackRef = useRef(onLocationChange);
  callbackRef.current = onLocationChange;

  const html = `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>body{margin:0}#map{width:100%;height:100vh}
.pin{width:30px;height:30px;border-radius:50%;background:${markerColor};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:grab}
.pin::after{content:'';position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${markerColor}}
</style></head><body>
<div id="map"></div>
<script>
var map=L.map('map',{zoomControl:false}).setView([${latitude},${longitude}],16);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'OSM'}).addTo(map);
var icon=L.divIcon({className:'',html:'<div class="pin"></div>',iconSize:[30,30],iconAnchor:[15,30]});
var marker=L.marker([${latitude},${longitude}],{icon:icon,draggable:true}).addTo(map);
function sendPos(p){
  var msg=JSON.stringify({type:'mapPin',lat:p.lat,lng:p.lng});
  if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(msg)}
  else{window.parent.postMessage(msg,'*')}
}
marker.on('dragend',function(e){sendPos(e.target.getLatLng())});
map.on('click',function(e){marker.setLatLng(e.latlng);sendPos(e.latlng)});
</script></body></html>`;

  // Web: listen for postMessage from iframe
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'mapPin' && data.lat && data.lng && callbackRef.current) {
          callbackRef.current(data.lat, data.lng);
        }
      } catch {}
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, { height }]}>
        <iframe
          ref={iframeRef}
          srcDoc={html}
          style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8 } as any}
          title="dispatch-map"
        />
      </View>
    );
  }

  // Native: use WebView
  const WebView = require('react-native-webview').WebView;
  return (
    <View style={[styles.container, { height }]}>
      <WebView
        source={{ html }}
        style={styles.webview}
        onMessage={(event: any) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data?.lat && data?.lng && onLocationChange) {
              onLocationChange(data.lat, data.lng);
            }
          } catch {}
        }}
        javaScriptEnabled
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 8, overflow: 'hidden', backgroundColor: '#2A2F38' },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
