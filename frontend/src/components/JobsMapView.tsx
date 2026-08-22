import React, { useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, Platform } from 'react-native';

export interface JobMarker {
  id: string;
  latitude: number;
  longitude: number;
  category: string;
  title: string;
  budget: number;
  emoji: string;
}

interface JobsMapViewProps {
  initialRegion?: {
    latitude: number;
    longitude: number;
  };
  jobs: JobMarker[];
  onJobPress?: (jobId: string) => void;
  style?: any;
}

function generateJobsMapHtml(
  lat: number,
  lng: number,
  jobs: JobMarker[]
) {
  const jobsJson = JSON.stringify(jobs);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body,#map{width:100%;height:100%}
.leaflet-div-icon{background:none!important;border:none!important}
.job-pin{
  display:flex;align-items:center;justify-content:center;
  width:44px;height:44px;border-radius:14px;
  background:#fff;border:2px solid rgba(123,45,142,0.3);
  box-shadow:0 4px 12px rgba(0,0,0,0.15);
  font-size:22px;cursor:pointer;
  transition:transform 0.2s,box-shadow 0.2s;
  position:relative;
}
.job-pin:hover{transform:scale(1.15);box-shadow:0 6px 16px rgba(0,0,0,0.25)}
.job-pin.pintura{border-color:rgba(255,149,0,0.5);background:linear-gradient(135deg,#fff,#FFF3E0)}
.job-pin.plomeria{border-color:rgba(0,122,255,0.5);background:linear-gradient(135deg,#fff,#E3F2FD)}
.job-pin.electricidad{border-color:rgba(255,204,0,0.5);background:linear-gradient(135deg,#fff,#FFFDE7)}
.job-pin.limpieza{border-color:rgba(52,199,89,0.5);background:linear-gradient(135deg,#fff,#FFF0EC)}
.job-pin.construccion{border-color:rgba(175,82,50,0.5);background:linear-gradient(135deg,#fff,#EFEBE9)}
.job-pin.mudanzas{border-color:rgba(88,86,214,0.5);background:linear-gradient(135deg,#fff,#EDE7F6)}
.job-pin.carpinteria{border-color:rgba(162,132,94,0.5);background:linear-gradient(135deg,#fff,#F5F0EB)}
.job-pin.jardineria{border-color:rgba(0,200,83,0.5);background:linear-gradient(135deg,#fff,#FFF0EC)}
.job-budget{
  position:absolute;bottom:-10px;left:50%;transform:translateX(-50%);
  background:#FF7733;color:#000;font-size:9px;font-weight:800;
  padding:2px 6px;border-radius:6px;white-space:nowrap;
  box-shadow:0 2px 4px rgba(0,0,0,0.4);
}
.pulse-ring{
  position:absolute;top:-4px;left:-4px;right:-4px;bottom:-4px;
  border-radius:18px;border:2px solid rgba(0,200,83,0.3);
  animation:pulse 2s ease-out infinite;
}
@keyframes pulse{
  0%{opacity:1;transform:scale(1)}
  100%{opacity:0;transform:scale(1.5)}
}
.m-user{width:16px;height:16px;border-radius:50%;background:#007AFF;border:3px solid #fff;box-shadow:0 0 10px rgba(0,122,255,0.6)}
.leaflet-control-attribution{font-size:10px!important;opacity:0.5}
.leaflet-popup-content-wrapper{background:#fff;color:#333;border-radius:12px;border:1px solid rgba(0,0,0,0.1)}
.leaflet-popup-tip{background:#fff}
</style></head><body><div id="map"></div>
<script>
var map=L.map('map',{zoomControl:true}).setView([${lat},${lng}],14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxZoom:19,
  attribution:'© <a href="https://openstreetmap.org/">OSM</a>'
}).addTo(map);

function sendMsg(obj){
  var s=JSON.stringify(obj);
  try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(s)}catch(x){}
  try{window.parent.postMessage(s,'*')}catch(x){}
}

function formatBudget(n){
  if(n>=1000)return '$'+Math.round(n/1000)+'k';
  return '$'+n;
}

var jobs=${jobsJson};
var markers=[];

jobs.forEach(function(job){
  var catClass=job.category.toLowerCase().replace(/[^a-z]/g,'');
  var html='<div class="job-pin '+catClass+'">'+
    '<div class="pulse-ring"></div>'+
    job.emoji+
    '<div class="job-budget">'+formatBudget(job.budget)+'</div>'+
    '</div>';
  var icon=L.divIcon({
    className:'leaflet-div-icon',
    html:html,
    iconSize:[44,44],
    iconAnchor:[22,22]
  });
  var mk=L.marker([job.latitude,job.longitude],{icon:icon}).addTo(map);
  mk.on('click',function(){
    sendMsg({type:'jobPress',jobId:job.id});
  });
  markers.push(mk);
});

// User location marker
var userIcon=L.divIcon({
  className:'leaflet-div-icon',
  html:'<div class="m-user"></div>',
  iconSize:[16,16],
  iconAnchor:[8,8]
});
var userMarker=L.marker([${lat},${lng}],{icon:userIcon}).addTo(map);

// Fit bounds to show all jobs
if(markers.length>0){
  var group=L.featureGroup(markers);
  group.addLayer(userMarker);
  map.fitBounds(group.getBounds(),{padding:[50,50],maxZoom:14});
}

if(navigator.geolocation){
  navigator.geolocation.getCurrentPosition(function(p){
    userMarker.setLatLng([p.coords.latitude,p.coords.longitude]);
    sendMsg({type:'locationDetected',latitude:p.coords.latitude,longitude:p.coords.longitude});
  },function(){},{enableHighAccuracy:false,timeout:8000});
}
<\/script></body></html>`;
}

export default function JobsMapView({ initialRegion, jobs, onJobPress, style }: JobsMapViewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lat = initialRegion?.latitude || -28.4696;
  const lng = initialRegion?.longitude || -65.7852;

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (data.type === 'jobPress' && onJobPress) {
        onJobPress(data.jobId);
      }
    } catch {}
  }, [onJobPress]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }
  }, [handleMessage]);

  if (Platform.OS === 'web') {
    const html = generateJobsMapHtml(lat, lng, jobs);
    return (
      <View style={[styles.container, style]}>
        <iframe
          ref={iframeRef}
          srcDoc={html}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="Jobs Map"
        />
      </View>
    );
  }

  // For native, use WebView
  const html = generateJobsMapHtml(lat, lng, jobs);
  try {
    const { WebView } = require('react-native-webview');
    return (
      <View style={[styles.container, style]}>
        <WebView
          source={{ html }}
          style={{ flex: 1, backgroundColor: 'transparent' }}
          onMessage={(event: any) => {
            try {
              handleMessage({ data: event.nativeEvent.data } as any);
            } catch {}
          }}
          javaScriptEnabled
          originWhitelist={['*']}
        />
      </View>
    );
  } catch {
    return (
      <View style={[styles.container, styles.fallback, style]}>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  fallback: {
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
