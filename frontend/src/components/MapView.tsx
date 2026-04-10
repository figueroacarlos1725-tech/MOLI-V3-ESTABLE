import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Platform } from 'react-native';
import Constants from 'expo-constants';

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

const MAPBOX_TOKEN = Constants.expoConfig?.extra?.MAPBOX_TOKEN
  || process.env.EXPO_PUBLIC_MAPBOX_TOKEN
  || '';

function generateMapboxHtml(
  lat: number,
  lng: number,
  markers: MarkerProps[],
  showRoute: boolean,
  enableClick: boolean,
  token: string
) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link href="https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.css" rel="stylesheet"/>
<script src="https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden}
#map{width:100%;height:100%}
.marker-user{width:20px;height:20px;border-radius:50%;background:rgba(107,191,0,0.3);border:3px solid #6BBF00;animation:pulse 2s infinite}
.marker-driver{font-size:28px;text-align:center;line-height:32px;filter:drop-shadow(1px 1px 3px rgba(0,0,0,0.4));cursor:pointer}
.marker-pickup{width:16px;height:16px;border-radius:50%;background:#6BBF00;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)}
.marker-dropoff{width:16px;height:16px;border-radius:50%;background:#FF3B30;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)}
.mapboxgl-ctrl-attrib{font-size:9px!important}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(107,191,0,0.4)}70%{box-shadow:0 0 0 14px rgba(107,191,0,0)}100%{box-shadow:0 0 0 0 rgba(107,191,0,0)}}
.popup-content{font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;padding:4px 8px;font-weight:600}
</style>
</head>
<body>
<div id="map"></div>
<script>
mapboxgl.accessToken='${token}';
var map=new mapboxgl.Map({
  container:'map',
  style:'mapbox://styles/mapbox/streets-v12',
  center:[${lng},${lat}],
  zoom:14,
  attributionControl:true
});
map.addControl(new mapboxgl.NavigationControl({showCompass:false}),'top-right');
map.addControl(new mapboxgl.GeolocateControl({
  positionOptions:{enableHighAccuracy:true},
  trackUserLocation:true,
  showUserHeading:true
}),'top-right');

var currentMarkers=[];
var routeAdded=false;

function createMarkerEl(type){
  var el=document.createElement('div');
  switch(type){
    case 'pickup':el.className='marker-pickup';break;
    case 'dropoff':el.className='marker-dropoff';break;
    case 'driver':el.className='marker-driver';el.innerHTML='🚗';break;
    default:el.className='marker-user';break;
  }
  return el;
}

function clearMarkers(){
  currentMarkers.forEach(function(m){m.remove()});
  currentMarkers=[];
  if(routeAdded&&map.getSource('route')){
    map.removeLayer('route-line');
    map.removeSource('route');
    routeAdded=false;
  }
}

function setMarkers(arr){
  clearMarkers();
  var bounds=new mapboxgl.LngLatBounds();
  arr.forEach(function(m){
    var el=createMarkerEl(m.type||'user');
    var marker=new mapboxgl.Marker({element:el})
      .setLngLat([m.longitude,m.latitude])
      .addTo(map);
    if(m.title){
      marker.setPopup(new mapboxgl.Popup({offset:25,closeButton:false})
        .setHTML('<div class="popup-content">'+m.title+'</div>'));
    }
    currentMarkers.push(marker);
    bounds.extend([m.longitude,m.latitude]);
  });

  if(arr.length>1){
    map.fitBounds(bounds,{padding:{top:60,bottom:60,left:40,right:40},maxZoom:15});
  }

  if(${showRoute?'true':'false'}&&arr.length>=2){
    drawRoute(arr);
  }
}

function drawRoute(arr){
  if(arr.length<2)return;
  var pickup=arr.find(function(m){return m.type==='pickup'})||arr[0];
  var dropoff=arr.find(function(m){return m.type==='dropoff'})||arr[arr.length-1];
  
  var url='https://api.mapbox.com/directions/v5/mapbox/driving/'+
    pickup.longitude+','+pickup.latitude+';'+
    dropoff.longitude+','+dropoff.latitude+
    '?geometries=geojson&overview=full&access_token=${token}';
  
  fetch(url).then(function(r){return r.json()}).then(function(data){
    if(data.routes&&data.routes.length>0){
      var route=data.routes[0].geometry;
      if(map.getSource('route')){
        map.getSource('route').setData({type:'Feature',geometry:route});
      }else{
        map.addSource('route',{type:'geojson',data:{type:'Feature',geometry:route}});
        map.addLayer({
          id:'route-line',
          type:'line',
          source:'route',
          layout:{'line-join':'round','line-cap':'round'},
          paint:{'line-color':'#6BBF00','line-width':5,'line-opacity':0.85}
        });
      }
      routeAdded=true;
    }
  }).catch(function(e){
    console.log('Route error:',e);
    // Fallback: draw straight line
    var coords=arr.map(function(m){return[m.longitude,m.latitude]});
    if(map.getSource('route')){
      map.getSource('route').setData({type:'Feature',geometry:{type:'LineString',coordinates:coords}});
    }else{
      map.addSource('route',{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:coords}}});
      map.addLayer({
        id:'route-line',type:'line',source:'route',
        layout:{'line-join':'round','line-cap':'round'},
        paint:{'line-color':'#6BBF00','line-width':4,'line-dasharray':[2,2]}
      });
    }
    routeAdded=true;
  });
}

map.on('load',function(){
  var initMarkers=${JSON.stringify(markers)};
  if(initMarkers.length>0)setMarkers(initMarkers);
});

${enableClick?`map.on('click',function(e){
  var msg=JSON.stringify({type:'mapPress',latitude:e.lngLat.lat,longitude:e.lngLat.lng});
  try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(msg)}catch(x){}
  try{window.parent.postMessage(msg,'*')}catch(x){}
});`:''}

window.updateMarkers=function(arr){setMarkers(arr)};
window.panTo=function(lat,lng,z){map.flyTo({center:[lng,lat],zoom:z||14,duration:1500})};
window.setStyle=function(s){map.setStyle('mapbox://styles/mapbox/'+s)};

if(navigator.geolocation){
  navigator.geolocation.getCurrentPosition(function(p){
    map.flyTo({center:[p.coords.longitude,p.coords.latitude],zoom:14,duration:2000});
    var msg=JSON.stringify({type:'locationDetected',latitude:p.coords.latitude,longitude:p.coords.longitude});
    try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(msg)}catch(x){}
    try{window.parent.postMessage(msg,'*')}catch(x){}
  },function(){},{ enableHighAccuracy:false,timeout:8000});
}
<\/script>
</body>
</html>`;
}

function WebMapView({ initialRegion, markers = [], showRoute = false, onMapPress, style }: MapViewProps) {
  const iframeRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const injectedRef = useRef(false);
  const markersRef = useRef(markers);
  markersRef.current = markers;

  const lat = initialRegion?.latitude || DEFAULT_LAT;
  const lng = initialRegion?.longitude || DEFAULT_LNG;

  useEffect(() => {
    if (Platform.OS !== 'web' || injectedRef.current) return;

    const inject = () => {
      const el = document.querySelector('[data-map-container="true"]');
      if (!el || injectedRef.current) return;
      injectedRef.current = true;

      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'width:100%;height:100%;border:none;border-radius:12px;position:absolute;top:0;left:0;z-index:0;';
      iframe.allow = 'geolocation';

      const html = generateMapboxHtml(lat, lng, markersRef.current, showRoute, !!onMapPress, MAPBOX_TOKEN);
      iframe.srcdoc = html;
      iframeRef.current = iframe;
      iframe.onload = () => setIsLoading(false);

      (el as HTMLElement).style.position = 'relative';
      el.appendChild(iframe);
    };

    // Try multiple times in case DOM isn't ready
    const t1 = setTimeout(inject, 200);
    const t2 = setTimeout(inject, 500);
    const t3 = setTimeout(inject, 1000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [lat, lng, showRoute, onMapPress]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data.type === 'mapPress' && onMapPress) {
          onMapPress({ latitude: data.latitude, longitude: data.longitude });
        }
      } catch (e) {}
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onMapPress]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !iframeRef.current) return;
    try {
      const win = iframeRef.current.contentWindow;
      if (win && win.updateMarkers) win.updateMarkers(markers);
    } catch (e) {}
  }, [markers]);

  return (
    <View
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

  const mapHtml = generateMapboxHtml(lat, lng, markers, showRoute, !!onMapPress, MAPBOX_TOKEN);

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
        geolocationEnabled={true}
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
    backgroundColor: '#f0f0f0',
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
