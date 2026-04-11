import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Platform } from 'react-native';

interface VehicleIconConfig {
  vehicle_type: string;
  icon_type: 'emoji' | 'image';
  emoji_value: string | null;
  image_data: string | null;
}

interface MarkerProps {
  latitude: number;
  longitude: number;
  title?: string;
  type?: 'pickup' | 'dropoff' | 'driver' | 'user';
  vehicleType?: string;
  draggable?: boolean;
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
  onRouteInfo?: (info: { distance_km: number; duration_min: number }) => void;
  style?: any;
}

// Catamarca, Argentina as default
const DEFAULT_LAT = -28.4696;
const DEFAULT_LNG = -65.7852;

function generateLeafletHtml(
  lat: number,
  lng: number,
  markers: MarkerProps[],
  showRoute: boolean,
  enableClick: boolean,
  vehicleIcons: VehicleIconConfig[] = []
) {
  const iconsMap: Record<string, { type: string; emoji: string; image: string }> = {};
  vehicleIcons.forEach(ic => {
    iconsMap[ic.vehicle_type] = {
      type: ic.icon_type,
      emoji: ic.emoji_value || '🚗',
      image: ic.image_data || '',
    };
  });
  const iconsJson = JSON.stringify(iconsMap);
  const markersJson = JSON.stringify(markers);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#map{width:100%;height:100%}
.leaflet-div-icon{background:none!important;border:none!important}
.m-pickup{width:22px;height:22px;border-radius:50%;background:#6BBF00;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);cursor:grab}
.m-dropoff{width:16px;height:16px;border-radius:50%;background:#EF4444;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)}
.m-user{width:14px;height:14px;border-radius:50%;background:#007AFF;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3)}
.m-driver{display:flex;align-items:center;justify-content:center;width:36px;height:36px;background:#fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:20px}
.popup-content{font:600 13px -apple-system,BlinkMacSystemFont,sans-serif;color:#1C1C1E;padding:4px}
.leaflet-control-attribution{font-size:10px!important;opacity:0.6}
</style></head><body><div id="map"></div>
<script>
var vicMap=${iconsJson};
var map=L.map('map',{zoomControl:true}).setView([${lat},${lng}],14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxZoom:19,
  attribution:'© <a href="https://www.openstreetmap.org/copyright">OSM</a>'
}).addTo(map);

var currentMarkers=[];
var routeLayer=null;

function getIcon(type,vt){
  if(type==='pickup')return L.divIcon({className:'leaflet-div-icon',html:'<div class="m-pickup"></div>',iconSize:[22,22],iconAnchor:[11,11]});
  if(type==='dropoff')return L.divIcon({className:'leaflet-div-icon',html:'<div class="m-dropoff"></div>',iconSize:[16,16],iconAnchor:[8,8]});
  if(type==='user')return L.divIcon({className:'leaflet-div-icon',html:'<div class="m-user"></div>',iconSize:[14,14],iconAnchor:[7,7]});
  if(type==='driver'){
    var emoji='🚗';var v=vt||'economy';
    if(vicMap[v]&&vicMap[v].emoji)emoji=vicMap[v].emoji;
    else{var em={'economy':'🚗','comfort':'🚙','premium':'🏎️','xl':'🚌'};emoji=em[v]||'🚗';}
    return L.divIcon({className:'leaflet-div-icon',html:'<div class="m-driver">'+emoji+'</div>',iconSize:[36,36],iconAnchor:[18,18]});
  }
  return L.divIcon({className:'leaflet-div-icon',html:'<div class="m-user"></div>',iconSize:[14,14],iconAnchor:[7,7]});
}

function sendMsg(obj){
  var s=JSON.stringify(obj);
  try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(s)}catch(x){}
  try{window.parent.postMessage(s,'*')}catch(x){}
}

function clearAll(){
  currentMarkers.forEach(function(m){map.removeLayer(m)});
  currentMarkers=[];
  if(routeLayer){map.removeLayer(routeLayer);routeLayer=null;}
}

function setMarkers(arr){
  clearAll();
  if(!arr||arr.length===0)return;
  var bounds=L.latLngBounds([]);
  arr.forEach(function(m){
    var ic=getIcon(m.type||'user',m.vehicleType);
    var mk=L.marker([m.latitude,m.longitude],{icon:ic,draggable:m.draggable||false}).addTo(map);
    if(m.title)mk.bindPopup('<div class="popup-content">'+m.title+'</div>');
    if(m.draggable){
      mk.on('dragend',function(e){
        var ll=e.target.getLatLng();
        sendMsg({type:'markerDrag',markerType:m.type||'',latitude:ll.lat,longitude:ll.lng});
      });
    }
    currentMarkers.push(mk);
    bounds.extend([m.latitude,m.longitude]);
  });
  if(arr.length>1)map.fitBounds(bounds,{padding:[60,40],maxZoom:15});
  else if(arr.length===1)map.setView([arr[0].latitude,arr[0].longitude],14);
  var hasP=arr.some(function(m){return m.type==='pickup'});
  var hasD=arr.some(function(m){return m.type==='dropoff'});
  if(hasP&&hasD)drawRoute(arr);
}

function drawRoute(arr){
  var p=arr.find(function(m){return m.type==='pickup'});
  var d=arr.find(function(m){return m.type==='dropoff'});
  if(!p||!d)return;
  var url='https://router.project-osrm.org/route/v1/driving/'+p.longitude+','+p.latitude+';'+d.longitude+','+d.latitude+'?overview=full&geometries=geojson';
  fetch(url).then(function(r){return r.json()}).then(function(data){
    if(data.routes&&data.routes.length>0){
      var rt=data.routes[0];
      var coords=rt.geometry.coordinates.map(function(c){return[c[1],c[0]]});
      if(routeLayer)map.removeLayer(routeLayer);
      routeLayer=L.polyline(coords,{color:'#6BBF00',weight:5,opacity:0.85}).addTo(map);
      sendMsg({type:'routeInfo',distance_km:rt.distance/1000,duration_min:Math.ceil(rt.duration/60)});
    }
  }).catch(function(e){console.error('Route error:',e)});
}

${enableClick ? `map.on('click',function(e){
  sendMsg({type:'mapPress',latitude:e.latlng.lat,longitude:e.latlng.lng});
});` : ''}

window.updateMarkers=function(arr){setMarkers(arr)};
window.panTo=function(lat,lng,z){map.setView([lat,lng],z||14)};

if(navigator.geolocation){
  navigator.geolocation.getCurrentPosition(function(p){
    map.setView([p.coords.latitude,p.coords.longitude],14);
    sendMsg({type:'locationDetected',latitude:p.coords.latitude,longitude:p.coords.longitude});
  },function(){},{enableHighAccuracy:false,timeout:8000});
}

var initM=${markersJson};
if(initM.length>0)setMarkers(initM);
<\/script></body></html>`;
}

function generateGoogleHtml(
  lat: number,
  lng: number,
  markers: MarkerProps[],
  showRoute: boolean,
  enableClick: boolean,
  googleKey: string,
  vehicleIcons: VehicleIconConfig[] = []
) {
  const iconsMap: Record<string, { type: string; emoji: string; image: string }> = {};
  vehicleIcons.forEach(ic => {
    iconsMap[ic.vehicle_type] = { type: ic.icon_type, emoji: ic.emoji_value || '🚗', image: ic.image_data || '' };
  });
  const iconsJson = JSON.stringify(iconsMap);
  const markersJson = JSON.stringify(markers);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>*{margin:0;padding:0}html,body,#map{width:100%;height:100%}</style>
</head><body><div id="map"></div>
<script>
var vicMap=${iconsJson};
var map,directionsRenderer,currentMarkers=[];

function sendMsg(obj){
  var s=JSON.stringify(obj);
  try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(s)}catch(x){}
  try{window.parent.postMessage(s,'*')}catch(x){}
}

function getMarkerIcon(type,vt){
  var emojiMap={'economy':'🚗','comfort':'🚙','premium':'🏎️','xl':'🚌'};
  if(type==='pickup')return{path:google.maps.SymbolPath.CIRCLE,scale:11,fillColor:'#6BBF00',fillOpacity:1,strokeColor:'#fff',strokeWeight:3};
  if(type==='dropoff')return{path:google.maps.SymbolPath.CIRCLE,scale:8,fillColor:'#EF4444',fillOpacity:1,strokeColor:'#fff',strokeWeight:3};
  if(type==='user')return{path:google.maps.SymbolPath.CIRCLE,scale:7,fillColor:'#007AFF',fillOpacity:1,strokeColor:'#fff',strokeWeight:2};
  return null;
}

function clearAll(){
  currentMarkers.forEach(function(m){m.setMap(null)});
  currentMarkers=[];
  if(directionsRenderer)directionsRenderer.setMap(null);
}

function setMarkers(arr){
  clearAll();
  if(!arr||arr.length===0)return;
  var bounds=new google.maps.LatLngBounds();
  arr.forEach(function(m){
    var opts={position:{lat:m.latitude,lng:m.longitude},map:map,draggable:m.draggable||false};
    if(m.type==='driver'){
      var emoji='🚗';var v=m.vehicleType||'economy';
      if(vicMap[v]&&vicMap[v].emoji)emoji=vicMap[v].emoji;
      else if(emojiMap[v])emoji=emojiMap[v];
      opts.label={text:emoji,fontSize:'20px'};
      opts.icon={path:google.maps.SymbolPath.CIRCLE,scale:18,fillColor:'#fff',fillOpacity:1,strokeColor:'#ddd',strokeWeight:1};
    }else{
      var ic=getMarkerIcon(m.type);
      if(ic)opts.icon=ic;
    }
    var mk=new google.maps.Marker(opts);
    if(m.title){var iw=new google.maps.InfoWindow({content:'<b style="font:600 13px sans-serif">'+m.title+'</b>'});mk.addListener('click',function(){iw.open(map,mk)});}
    if(m.draggable){
      mk.addListener('dragend',function(){
        var pos=mk.getPosition();
        sendMsg({type:'markerDrag',markerType:m.type||'',latitude:pos.lat(),longitude:pos.lng()});
      });
    }
    currentMarkers.push(mk);
    bounds.extend(opts.position);
  });
  if(arr.length>1)map.fitBounds(bounds,{top:60,bottom:60,left:40,right:40});
  else if(arr.length===1)map.setCenter({lat:arr[0].latitude,lng:arr[0].longitude});
  var hasP=arr.some(function(m){return m.type==='pickup'});
  var hasD=arr.some(function(m){return m.type==='dropoff'});
  if(hasP&&hasD)drawRoute(arr);
}

var emojiMap={'economy':'🚗','comfort':'🚙','premium':'🏎️','xl':'🚌'};

function drawRoute(arr){
  var p=arr.find(function(m){return m.type==='pickup'});
  var d=arr.find(function(m){return m.type==='dropoff'});
  if(!p||!d)return;
  var ds=new google.maps.DirectionsService();
  if(!directionsRenderer)directionsRenderer=new google.maps.DirectionsRenderer({suppressMarkers:true,polylineOptions:{strokeColor:'#6BBF00',strokeWeight:5,strokeOpacity:0.85}});
  directionsRenderer.setMap(map);
  ds.route({origin:{lat:p.latitude,lng:p.longitude},destination:{lat:d.latitude,lng:d.longitude},travelMode:'DRIVING'},function(result,status){
    if(status==='OK'){
      directionsRenderer.setDirections(result);
      var leg=result.routes[0].legs[0];
      sendMsg({type:'routeInfo',distance_km:leg.distance.value/1000,duration_min:Math.ceil(leg.duration.value/60)});
    }
  });
}

function initMap(){
  map=new google.maps.Map(document.getElementById('map'),{
    center:{lat:${lat},lng:${lng}},zoom:14,
    disableDefaultUI:false,zoomControl:true,mapTypeControl:false,streetViewControl:false,fullscreenControl:false,
    styles:[{featureType:'poi',stylers:[{visibility:'simplified'}]}]
  });
  ${enableClick ? `map.addListener('click',function(e){
    sendMsg({type:'mapPress',latitude:e.latLng.lat(),longitude:e.latLng.lng()});
  });` : ''}
  window.updateMarkers=function(arr){setMarkers(arr)};
  var initM=${markersJson};
  if(initM.length>0)setMarkers(initM);
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(function(p){
      map.setCenter({lat:p.coords.latitude,lng:p.coords.longitude});
      sendMsg({type:'locationDetected',latitude:p.coords.latitude,longitude:p.coords.longitude});
    },function(){},{enableHighAccuracy:false,timeout:8000});
  }
}
<\/script>
<script src="https://maps.googleapis.com/maps/api/js?key=${googleKey}&libraries=places&callback=initMap" async defer><\/script>
</body></html>`;
}

function WebMapView({ initialRegion, markers = [], showRoute = false, onMapPress, onMarkerDrag, onRouteInfo, style, vehicleIcons = [], mapProvider = 'osm', googleKey = '' }: MapViewProps & { vehicleIcons: VehicleIconConfig[]; mapProvider?: string; googleKey?: string }) {
  const containerRef = useRef<View>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(false);
  const markersRef = useRef(markers);
  markersRef.current = markers;

  const lat = initialRegion?.latitude || DEFAULT_LAT;
  const lng = initialRegion?.longitude || DEFAULT_LNG;

  useEffect(() => {
    if (Platform.OS !== 'web' || mountedRef.current) return;

    const timer = setTimeout(() => {
      const domNode = containerRef.current as unknown as HTMLDivElement;
      if (!domNode || mountedRef.current) return;

      mountedRef.current = true;

      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'width:100%;height:100%;border:none;border-radius:12px;position:absolute;top:0;left:0;z-index:0;';
      iframe.allow = 'geolocation';
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');

      const html = mapProvider === 'google' && googleKey
        ? generateGoogleHtml(lat, lng, markersRef.current, showRoute, !!onMapPress, googleKey, vehicleIcons)
        : generateLeafletHtml(lat, lng, markersRef.current, showRoute, !!onMapPress, vehicleIcons);
      iframe.srcdoc = html;
      iframeRef.current = iframe;

      iframe.onload = () => {
        setIsLoading(false);
      };

      domNode.style.position = 'relative';
      domNode.appendChild(iframe);
    }, 100);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data.type === 'mapPress' && onMapPress) {
          onMapPress({ latitude: data.latitude, longitude: data.longitude });
        }
        if (data.type === 'markerDrag' && onMarkerDrag) {
          onMarkerDrag(data.markerType, { latitude: data.latitude, longitude: data.longitude });
        }
        if (data.type === 'routeInfo' && onRouteInfo) {
          onRouteInfo({ distance_km: data.distance_km, duration_min: data.duration_min });
        }
      } catch (e) {
        // Ignore non-JSON messages
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onMapPress, onMarkerDrag, onRouteInfo]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !iframeRef.current) return;
    try {
      const win = iframeRef.current.contentWindow as any;
      if (win && win.updateMarkers) {
        win.updateMarkers(markers);
      }
    } catch (e) {
      // Cross-origin or not loaded yet
    }
  }, [markers]);

  return (
    <View ref={containerRef} style={[styles.container, style]}>
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6BBF00" />
          <Text style={styles.loadingText}>Cargando mapa...</Text>
        </View>
      )}
    </View>
  );
}

function NativeMapView({ initialRegion, markers = [], showRoute = false, onMapPress, onMarkerDrag, onRouteInfo, style, vehicleIcons = [], mapProvider = 'osm', googleKey = '' }: MapViewProps & { vehicleIcons: VehicleIconConfig[]; mapProvider?: string; googleKey?: string }) {
  const WebView = require('react-native-webview').WebView;
  const webViewRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const lat = initialRegion?.latitude || DEFAULT_LAT;
  const lng = initialRegion?.longitude || DEFAULT_LNG;

  const mapHtml = (mapProvider === 'google' && googleKey)
    ? generateGoogleHtml(lat, lng, markers, showRoute, !!onMapPress, googleKey, vehicleIcons)
    : generateLeafletHtml(lat, lng, markers, showRoute, !!onMapPress, vehicleIcons);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'mapPress' && onMapPress) {
        onMapPress({ latitude: data.latitude, longitude: data.longitude });
      } else if (data.type === 'markerDrag' && onMarkerDrag) {
        onMarkerDrag(data.markerType || data.markerId, { latitude: data.latitude, longitude: data.longitude });
      } else if (data.type === 'routeInfo' && onRouteInfo) {
        onRouteInfo({ distance_km: data.distance_km, duration_min: data.duration_min });
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

// Cache vehicle icons to avoid repeated API calls
let cachedVehicleIcons: VehicleIconConfig[] = [];
let iconsFetchPromise: Promise<VehicleIconConfig[]> | null = null;

async function fetchVehicleIcons(): Promise<VehicleIconConfig[]> {
  if (cachedVehicleIcons.length > 0) return cachedVehicleIcons;
  if (iconsFetchPromise) return iconsFetchPromise;

  const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
  iconsFetchPromise = fetch(`${backendUrl}/api/vehicle-icons`)
    .then(r => r.json())
    .then(data => {
      cachedVehicleIcons = data.icons || [];
      iconsFetchPromise = null;
      return cachedVehicleIcons;
    })
    .catch(() => {
      iconsFetchPromise = null;
      return [];
    });
  return iconsFetchPromise;
}

// Map config cache
let cachedMapConfig: { provider: string; google_key: string } | null = null;
let mapConfigPromise: Promise<{ provider: string; google_key: string }> | null = null;

async function fetchMapConfig(): Promise<{ provider: string; google_key: string }> {
  if (cachedMapConfig) return cachedMapConfig;
  if (mapConfigPromise) return mapConfigPromise;
  
  mapConfigPromise = (async () => {
    try {
      const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const resp = await fetch(`${backendUrl}/api/config/maps`);
      const data = await resp.json();
      cachedMapConfig = { provider: data.provider || 'google', google_key: data.google_key || process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || '' };
    } catch {
      cachedMapConfig = { provider: 'google', google_key: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || '' };
    }
    mapConfigPromise = null;
    return cachedMapConfig;
  })();
  return mapConfigPromise;
}

export function MapView(props: MapViewProps) {
  const [vehicleIcons, setVehicleIcons] = useState<VehicleIconConfig[]>(cachedVehicleIcons);
  const [mapConfig, setMapConfig] = useState(cachedMapConfig || { provider: 'google', google_key: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || '' });
  const [configLoaded, setConfigLoaded] = useState(!!cachedMapConfig);

  useEffect(() => {
    fetchVehicleIcons().then(icons => {
      if (icons.length > 0) setVehicleIcons(icons);
    });
    fetchMapConfig().then(config => {
      setMapConfig(config);
      setConfigLoaded(true);
    });
  }, []);

  if (!configLoaded) {
    return (
      <View style={[styles.container, props.style]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6BBF00" />
          <Text style={styles.loadingText}>Cargando mapa...</Text>
        </View>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return <WebMapView {...props} vehicleIcons={vehicleIcons} mapProvider={mapConfig.provider} googleKey={mapConfig.google_key} />;
  }
  return <NativeMapView {...props} vehicleIcons={vehicleIcons} mapProvider={mapConfig.provider} googleKey={mapConfig.google_key} />;
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
