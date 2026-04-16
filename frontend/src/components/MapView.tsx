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
  onLabelTap?: (markerType: string) => void;
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
.m-pickup{width:22px;height:22px;border-radius:50%;background:#00C853;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);cursor:grab}
.m-dropoff{width:16px;height:16px;border-radius:50%;background:#EF4444;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)}
.m-label-wrap{display:flex;align-items:center;gap:6px;white-space:nowrap}
.m-label{background:rgba(255,255,255,0.95);backdrop-filter:blur(8px);padding:6px 12px;border-radius:12px;font:600 12px -apple-system,BlinkMacSystemFont,sans-serif;color:#1C1C1E;box-shadow:0 2px 10px rgba(0,0,0,0.18);max-width:180px;overflow:hidden;text-overflow:ellipsis;cursor:pointer;border:1.5px solid rgba(0,0,0,0.06);transition:transform 0.15s}
.m-label:active{transform:scale(0.96)}
.m-label-pickup{border-left:3px solid #00C853}
.m-label-dropoff{border-left:3px solid #EF4444}
.m-menu{position:absolute;top:32px;left:0;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.25);padding:4px 0;z-index:9999;min-width:160px;display:none;animation:fadeIn 0.2s}
.m-menu.active{display:block}
.m-menu-item{padding:10px 14px;font:500 13px -apple-system,sans-serif;color:#1C1C1E;cursor:pointer;display:flex;align-items:center;gap:8px}
.m-menu-item:hover{background:#F2F2F7}
.m-menu-item .icon{font-size:16px}
@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
.m-user{width:14px;height:14px;border-radius:50%;background:#007AFF;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3)}
.m-driver{display:flex;align-items:center;justify-content:center;width:44px;height:44px;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.4))}
.m-driver img{width:44px;height:44px;object-fit:contain}
.m-pulse{position:absolute;width:60px;height:60px;border-radius:50%;background:rgba(0,200,83,0.15);animation:pulse 2s ease-out infinite;pointer-events:none}
@keyframes pulse{0%{transform:scale(0.8);opacity:1}100%{transform:scale(2);opacity:0}}
.popup-content{font:600 13px -apple-system,BlinkMacSystemFont,sans-serif;color:#1C1C1E;padding:4px}
.leaflet-control-attribution{font-size:10px!important;opacity:0.4}
</style></head><body><div id="map"></div>
<script>
var vicMap=${iconsJson};
var map=L.map('map',{zoomControl:true}).setView([${lat},${lng}],14);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{
  maxZoom:19,
  attribution:'© <a href="https://carto.com/">CARTO</a>'
}).addTo(map);

var currentMarkers=[];
var routeLayer=null;

function getIcon(type,vt,title){
  if(type==='pickup'){
    var lbl=title?'<div class="m-label m-label-pickup" onclick="onLabelClick(event,\'pickup\')">'+title+'</div>':'';
    return L.divIcon({className:'leaflet-div-icon',html:'<div class="m-label-wrap"><div class="m-pickup"></div>'+lbl+'</div>',iconSize:[200,32],iconAnchor:[11,16]});
  }
  if(type==='dropoff'){
    var lbl2=title?'<div class="m-label m-label-dropoff" onclick="onLabelClick(event,\'dropoff\')">'+title+'</div>':'';
    return L.divIcon({className:'leaflet-div-icon',html:'<div class="m-label-wrap"><div class="m-dropoff"></div>'+lbl2+'</div>',iconSize:[200,32],iconAnchor:[8,16]});
  }
  if(type==='user')return L.divIcon({className:'leaflet-div-icon',html:'<div class="m-user"></div>',iconSize:[14,14],iconAnchor:[7,7]});
  if(type==='driver'){
    var v=vt||'economy';
    var imgSrc='data:image/png;base64,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';
    if(v==='moto')imgSrc='data:image/png;base64,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';
    return L.divIcon({className:'leaflet-div-icon',html:'<div class="m-pulse"></div><div class="m-driver"><img src="'+imgSrc+'"/></div>',iconSize:[44,44],iconAnchor:[22,22]});
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

var _firstFit=true;
function setMarkers(arr){
  clearAll();
  if(!arr||arr.length===0)return;
  var bounds=L.latLngBounds([]);
  arr.forEach(function(m){
    var ic=getIcon(m.type||'user',m.vehicleType,m.title||'');
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
  if(_firstFit){
    if(arr.length>1)map.fitBounds(bounds,{padding:[60,40],maxZoom:15});
    else if(arr.length===1)map.setView([arr[0].latitude,arr[0].longitude],14);
    _firstFit=false;
  }
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
      routeLayer=L.polyline(coords,{color:'#00C853',weight:5,opacity:0.85}).addTo(map);
      sendMsg({type:'routeInfo',distance_km:rt.distance/1000,duration_min:Math.ceil(rt.duration/60)});
    }
  }).catch(function(e){console.error('Route error:',e)});
}

${enableClick ? `map.on('click',function(e){
  sendMsg({type:'mapPress',latitude:e.latlng.lat,longitude:e.latlng.lng});
});` : ''}

window.updateMarkers=function(arr){setMarkers(arr)};
window.panTo=function(lat,lng,z){map.setView([lat,lng],z||14)};
window.fitView=function(){_firstFit=true};
window.zoomToPoint=function(lat,lng){map.flyTo([lat,lng],17,{duration:0.8})};
window.resetZoom=function(){_firstFit=true;if(currentMarkers.length>1){var b=L.latLngBounds([]);currentMarkers.forEach(function(m){b.extend(m.getLatLng())});map.flyToBounds(b,{padding:[60,40],maxZoom:15,duration:0.8})}};

function onLabelClick(e,type){
  e.stopPropagation();
  sendMsg({type:'labelTap',markerType:type});
}

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
  if(type==='pickup')return{path:google.maps.SymbolPath.CIRCLE,scale:11,fillColor:'#00C853',fillOpacity:1,strokeColor:'#fff',strokeWeight:3};
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
      var v=m.vehicleType||'economy';
      var imgUrl='data:image/png;base64,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';
      if(v==='moto')imgUrl='data:image/png;base64,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';
      opts.icon={url:imgUrl,scaledSize:new google.maps.Size(44,44),anchor:new google.maps.Point(22,22)};
    }else{
      var ic=getMarkerIcon(m.type);
      if(ic)opts.icon=ic;
    }
    var mk=new google.maps.Marker(opts);
    if((m.type==='pickup'||m.type==='dropoff')&&m.title){
      var color=m.type==='pickup'?'#00C853':'#EF4444';
      var shortTitle=m.title.length>25?m.title.substring(0,25)+'...':m.title;
      var iw=new google.maps.InfoWindow({
        content:'<div onclick="onLabelClick(&quot;'+m.type+'&quot;)" style="cursor:pointer;font:600 12px -apple-system,sans-serif;color:#1C1C1E;padding:2px 4px;border-left:3px solid '+color+';min-width:100px">'+shortTitle+'</div>',
        disableAutoPan:true
      });
      iw.open(map,mk);
      mk.addListener('click',function(){sendMsg({type:'labelTap',markerType:m.type});});
    }else if(m.title){
      var iw2=new google.maps.InfoWindow({content:'<b style="font:600 13px sans-serif">'+m.title+'</b>'});
      mk.addListener('click',function(){iw2.open(map,mk)});
    }
    if(m.draggable){
      mk.addListener('dragend',function(){
        var pos=mk.getPosition();
        sendMsg({type:'markerDrag',markerType:m.type||'',latitude:pos.lat(),longitude:pos.lng()});
      });
    }
    currentMarkers.push(mk);
    bounds.extend(opts.position);
  });
  if(arr.length>1)map.fitBounds(bounds,{top:80,bottom:80,left:60,right:60});
  else if(arr.length===1)map.setCenter({lat:arr[0].latitude,lng:arr[0].longitude});
  var hasP=arr.some(function(m){return m.type==='pickup'});
  var hasD=arr.some(function(m){return m.type==='dropoff'});
  if(hasP&&hasD)drawRoute(arr);
}

var emojiMap={'economy':'🚗','comfort':'🚙','premium':'🏎️','xl':'🚌'};

function onLabelClick(type){
  sendMsg({type:'labelTap',markerType:type});
}

function drawRoute(arr){
  var p=arr.find(function(m){return m.type==='pickup'});
  var d=arr.find(function(m){return m.type==='dropoff'});
  if(!p||!d)return;
  var ds=new google.maps.DirectionsService();
  if(!directionsRenderer)directionsRenderer=new google.maps.DirectionsRenderer({suppressMarkers:true,polylineOptions:{strokeColor:'#00C853',strokeWeight:5,strokeOpacity:0.85}});
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
    let routeInfoHandled = false;
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data.type === 'mapPress' && onMapPress) {
          onMapPress({ latitude: data.latitude, longitude: data.longitude });
        }
        if (data.type === 'markerDrag' && onMarkerDrag) {
          onMarkerDrag(data.markerType, { latitude: data.latitude, longitude: data.longitude });
        }
        if (data.type === 'routeInfo' && onRouteInfo && !routeInfoHandled) {
          routeInfoHandled = true;
          onRouteInfo({ distance_km: data.distance_km, duration_min: data.duration_min });
        }
      } catch (e) {
        // Ignore non-JSON messages
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onMapPress, onMarkerDrag, onRouteInfo]);

  // Only update markers when content actually changes (deep compare via JSON)
  const prevMarkersJson = useRef(JSON.stringify(markers));
  useEffect(() => {
    if (Platform.OS !== 'web' || !iframeRef.current) return;
    const json = JSON.stringify(markers);
    if (json === prevMarkersJson.current) return;
    prevMarkersJson.current = json;
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
          <ActivityIndicator size="large" color="#00C853" />
          <Text style={styles.loadingText}>Cargando mapa...</Text>
        </View>
      )}
    </View>
  );
}

function NativeMapView({ initialRegion, markers = [], showRoute = false, onMapPress, onMarkerDrag, onRouteInfo, onLabelTap, style, vehicleIcons = [], mapProvider = 'osm', googleKey = '' }: MapViewProps & { vehicleIcons: VehicleIconConfig[]; mapProvider?: string; googleKey?: string }) {
  const WebView = require('react-native-webview').WebView;
  const webViewRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const routeInfoSent = useRef(false);
  const lastMarkersJson = useRef('');

  const lat = initialRegion?.latitude || DEFAULT_LAT;
  const lng = initialRegion?.longitude || DEFAULT_LNG;

  // Memoize mapHtml to prevent WebView from reloading on every render
  const markersJson = JSON.stringify(markers);
  const mapHtml = React.useMemo(() => {
    return (mapProvider === 'google' && googleKey)
      ? generateGoogleHtml(lat, lng, markers, showRoute, !!onMapPress, googleKey, vehicleIcons)
      : generateLeafletHtml(lat, lng, markers, showRoute, !!onMapPress, vehicleIcons);
  }, [mapProvider, googleKey, lat.toFixed(3), lng.toFixed(3), showRoute, !!onMapPress, vehicleIcons.length]);

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'mapPress' && onMapPress) {
        onMapPress({ latitude: data.latitude, longitude: data.longitude });
      } else if (data.type === 'markerDrag' && onMarkerDrag) {
        onMarkerDrag(data.markerType || data.markerId, { latitude: data.latitude, longitude: data.longitude });
      } else if (data.type === 'routeInfo' && onRouteInfo) {
        // Only send routeInfo ONCE per unique route
        if (!routeInfoSent.current) {
          routeInfoSent.current = true;
          onRouteInfo({ distance_km: data.distance_km, duration_min: data.duration_min });
        }
      } else if (data.type === 'labelTap' && onLabelTap) {
        onLabelTap(data.markerType);
      }
    } catch (error) {
      // Silently ignore
    }
  }, [onMapPress, onMarkerDrag, onRouteInfo]);

  // Only inject markers when they actually change content
  useEffect(() => {
    if (markersJson !== lastMarkersJson.current) {
      lastMarkersJson.current = markersJson;
      routeInfoSent.current = false; // Reset so new route can report back
      if (webViewRef.current && markers.length > 0) {
        webViewRef.current.injectJavaScript(`
          if(window.updateMarkers){window.updateMarkers(${markersJson})}
          true;
        `);
      }
    }
  }, [markersJson]);

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
          <ActivityIndicator size="large" color="#00C853" />
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
          <ActivityIndicator size="large" color="#00C853" />
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
