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
  vehicleType?: string; // economy, comfort, premium, xl
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

// Catamarca, Argentina as default
const DEFAULT_LAT = -28.4696;
const DEFAULT_LNG = -65.7852;

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '';

function generateMapboxHtml(
  lat: number,
  lng: number,
  markers: MarkerProps[],
  showRoute: boolean,
  enableClick: boolean,
  token: string,
  vehicleIcons: VehicleIconConfig[] = []
) {
  // Build a JS object mapping vehicle_type -> icon config
  const iconsMap: Record<string, { type: string; emoji: string; image: string }> = {};
  vehicleIcons.forEach(ic => {
    iconsMap[ic.vehicle_type] = {
      type: ic.icon_type,
      emoji: ic.emoji_value || '🚗',
      image: ic.image_data || '',
    };
  });
  const iconsJson = JSON.stringify(iconsMap);

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
.marker-driver-img{width:40px;height:40px;object-fit:contain;filter:drop-shadow(1px 1px 3px rgba(0,0,0,0.4));cursor:pointer}
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
var vehicleIcons=${iconsJson};

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

function getDriverIcon(vType){
  var cfg=vehicleIcons[vType||'economy'];
  if(!cfg)cfg=vehicleIcons['economy'];
  if(!cfg)return{type:'emoji',value:'\\uD83D\\uDE97'};
  if(cfg.type==='image'&&cfg.image)return{type:'image',value:cfg.image};
  return{type:'emoji',value:cfg.emoji||'\\uD83D\\uDE97'};
}

function createMarkerEl(type,vType){
  var el=document.createElement('div');
  switch(type){
    case 'pickup':el.className='marker-pickup';break;
    case 'dropoff':el.className='marker-dropoff';break;
    case 'driver':
      var icon=getDriverIcon(vType);
      if(icon.type==='image'){
        var img=document.createElement('img');
        img.src=icon.value;
        img.className='marker-driver-img';
        el.appendChild(img);
      }else{
        el.className='marker-driver';
        el.textContent=icon.value;
      }
      break;
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
    var el=createMarkerEl(m.type||'user',m.vehicleType);
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

  if(${showRoute ? 'true' : 'false'}&&arr.length>=2){
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

${enableClick ? `map.on('click',function(e){
  var msg=JSON.stringify({type:'mapPress',latitude:e.lngLat.lat,longitude:e.lngLat.lng});
  try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(msg)}catch(x){}
  try{window.parent.postMessage(msg,'*')}catch(x){}
});` : ''}

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

function WebMapView({ initialRegion, markers = [], showRoute = false, onMapPress, style, vehicleIcons = [] }: MapViewProps & { vehicleIcons: VehicleIconConfig[] }) {
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

    // Use a small delay to ensure the View has rendered to a DOM node
    const timer = setTimeout(() => {
      // In React Native Web, ref.current IS the underlying DOM div
      const domNode = containerRef.current as unknown as HTMLDivElement;
      if (!domNode || mountedRef.current) return;

      mountedRef.current = true;

      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'width:100%;height:100%;border:none;border-radius:12px;position:absolute;top:0;left:0;z-index:0;';
      iframe.allow = 'geolocation';
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');

      const html = generateMapboxHtml(lat, lng, markersRef.current, showRoute, !!onMapPress, MAPBOX_TOKEN, vehicleIcons);
      iframe.srcdoc = html;
      iframeRef.current = iframe;

      iframe.onload = () => {
        setIsLoading(false);
      };

      // Set position relative so the absolute iframe positions correctly
      domNode.style.position = 'relative';
      domNode.appendChild(iframe);
    }, 100);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  // Listen for messages from the iframe (map clicks, location detected)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data.type === 'mapPress' && onMapPress) {
          onMapPress({ latitude: data.latitude, longitude: data.longitude });
        }
      } catch (e) {
        // Ignore non-JSON messages
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onMapPress]);

  // Update markers when they change
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

function NativeMapView({ initialRegion, markers = [], showRoute = false, onMapPress, onMarkerDrag, style, vehicleIcons = [] }: MapViewProps & { vehicleIcons: VehicleIconConfig[] }) {
  const WebView = require('react-native-webview').WebView;
  const webViewRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const lat = initialRegion?.latitude || DEFAULT_LAT;
  const lng = initialRegion?.longitude || DEFAULT_LNG;

  const mapHtml = generateMapboxHtml(lat, lng, markers, showRoute, !!onMapPress, MAPBOX_TOKEN, vehicleIcons);

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

export function MapView(props: MapViewProps) {
  const [vehicleIcons, setVehicleIcons] = useState<VehicleIconConfig[]>(cachedVehicleIcons);

  useEffect(() => {
    fetchVehicleIcons().then(icons => {
      if (icons.length > 0) setVehicleIcons(icons);
    });
  }, []);

  if (Platform.OS === 'web') {
    return <WebMapView {...props} vehicleIcons={vehicleIcons} />;
  }
  return <NativeMapView {...props} vehicleIcons={vehicleIcons} />;
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
