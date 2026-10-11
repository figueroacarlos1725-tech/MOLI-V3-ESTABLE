import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Platform,Text,View} from 'react-native';

export type FleetPoint={latitude:number;longitude:number;occurred_at?:string};
export type FleetMarker=FleetPoint&{id:string;title:string;vehicleType?:string;activity?:string;is_online?:boolean;provider_type?:string;iconUrl?:string};
type Props={markers:FleetMarker[];trajectory?:FleetPoint[];selectedId?:string;onSelect?:(id:string)=>void;style?:any};

export default function FleetMap({markers,trajectory=[],selectedId,onSelect,style}:Props){
 const container=useRef<any>(null),frame=useRef<HTMLIFrameElement|null>(null),native=useRef<any>(null);
 const latest=useRef({markers,trajectory,focusId:selectedId}),select=useRef(onSelect);latest.current={markers,trajectory,focusId:selectedId};select.current=onSelect;
 const[ready,setReady]=useState(false);
 const publish=()=>{
  const data={type:'fleet',...latest.current};
  if(Platform.OS==='web')frame.current?.contentWindow?.postMessage(data,window.location.origin);
  else native.current?.injectJavaScript(`window.updateFleet&&window.updateFleet(${JSON.stringify(data).replace(/</g,'\\u003c')});true;`);
 };
 useEffect(()=>{
  if(Platform.OS!=='web')return;
  const element=document.createElement('iframe');element.src='/map-shell.html';element.title='Flota y trayectoria en vivo';element.style.cssText='border:0;width:100%;height:100%;position:absolute;inset:0';
  frame.current=element;
  const receive=(event:MessageEvent)=>{
   if(event.source!==element.contentWindow||event.origin!==window.location.origin)return;
   try{const data=typeof event.data==='string'?JSON.parse(event.data):event.data;
    if(data?.type==='ready'){publish();setReady(true);}
    if(data?.type==='providerSelect')select.current?.(data.id);
   }catch{}
  };
  window.addEventListener('message',receive);element.onload=()=>{publish();setReady(true);};container.current?.appendChild(element);
  return()=>{window.removeEventListener('message',receive);element.remove();frame.current=null;};
 },[]);
 useEffect(()=>{if(ready)publish();},[markers,trajectory,selectedId,ready]);
 let content=null;
 if(Platform.OS!=='web'){
  const WebView=require('react-native-webview').WebView;
  content=<WebView ref={native} source={{uri:`${process.env.EXPO_PUBLIC_WEB_URL||'https://moli-qa-web.onrender.com'}/map-shell.html`}} style={{flex:1}} onLoadEnd={()=>{setReady(true);publish();}} onMessage={(event:any)=>{try{const data=JSON.parse(event.nativeEvent.data);if(data.type==='providerSelect')select.current?.(data.id);if(data.type==='ready'){publish();setReady(true);}}catch{}}}/>;
 }
 return <View ref={container} style={[{minHeight:350,position:'relative',overflow:'hidden',borderRadius:16,backgroundColor:'#EEE'},style]}>{content}{!ready&&<View style={{position:'absolute',inset:0,alignItems:'center',justifyContent:'center'}}><ActivityIndicator/><Text>Cargando mapa operativo…</Text></View>}</View>;
}
