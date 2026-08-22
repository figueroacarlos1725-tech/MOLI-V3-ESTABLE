import React, { useEffect, useMemo, useState } from 'react';
import { Image, Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ResizeMode, Video } from 'expo-av';
import { apiService } from '@/src/services/api';

type Trigger='ride_started'|'job_started'|'tramite_started'|'marketplace_open'|'order_created';
type Surface='rides'|'jobs'|'tramites'|'marketplace';
type Destination={type:'none'|'https'|'marketplace_store'|'marketplace_product';url?:string;merchant_id?:string;product_id?:string};
type Creative={creative_id:string;format:'image'|'video'|'marketplace_product';media_url?:string;poster_url?:string;title?:string;body?:string;sponsor_label?:string;cta_text?:string;destination:Destination};
type Delivery={delivery_id:string;creative:Creative;close_policy:{countdown_seconds:number;close_after_countdown:boolean;auto_close_seconds?:number}};

const sessionId=`ads-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const eventId=(type:string)=>`${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function CampaignVideo({uri,poster,onEvent}:{uri:string;poster?:string;onEvent:(type:string)=>void}){
  return <Video source={{uri}} posterSource={poster?{uri:poster}:undefined} usePoster={!!poster} style={s.media} resizeMode={ResizeMode.COVER} useNativeControls shouldPlay isMuted onError={()=>onEvent('media_error')} onPlaybackStatusUpdate={(status:any)=>{if(status?.isLoaded&&status.didJustFinish)onEvent('video_complete');}}/>;
}

export default function CampaignInterstitial({enabled,trigger,surface,entityType,entityId}:{enabled:boolean;trigger:Trigger;surface:Surface;entityType:string;entityId?:string}){
  const router=useRouter(); const [delivery,setDelivery]=useState<Delivery|null>(null); const [remaining,setRemaining]=useState(0);
  const closable=!!delivery&&(!delivery.close_policy.close_after_countdown||remaining<=0);
  const creative=delivery?.creative;
  const report=async(type:string)=>{if(!delivery)return;try{await apiService.post(`/ads/deliveries/${delivery.delivery_id}/events`,{client_event_id:eventId(type),type,occurred_at:new Date().toISOString()});}catch{}};

  useEffect(()=>{if(!enabled||!entityId)return;let alive=true;void apiService.post('/ads/decision',{trigger,surface,entity_type:entityType,entity_id:entityId,session_id:sessionId}).then(res=>{if(!alive||!res.delivery)return;setDelivery(res.delivery);setRemaining(res.delivery.close_policy?.countdown_seconds||0);}).catch(()=>{});return()=>{alive=false;};},[enabled,trigger,surface,entityType,entityId]);
  useEffect(()=>{if(!delivery)return;void report('rendered');void report('viewable');},[delivery?.delivery_id]);
  useEffect(()=>{if(!delivery||remaining<=0)return;const timer=setTimeout(()=>setRemaining(v=>Math.max(0,v-1)),1000);return()=>clearTimeout(timer);},[delivery,remaining]);
  useEffect(()=>{const seconds=delivery?.close_policy.auto_close_seconds;if(!delivery||!seconds)return;const timer=setTimeout(()=>setDelivery(null),seconds*1000);return()=>clearTimeout(timer);},[delivery?.delivery_id]);

  const destinationValid=useMemo(()=>{const d=creative?.destination;if(!d||d.type==='none')return false;if(d.type==='https')return !!d.url&&/^https:\/\/[^\s]+$/i.test(d.url);if(d.type==='marketplace_store')return !!d.merchant_id;if(d.type==='marketplace_product')return !!d.merchant_id&&!!d.product_id;return false;},[creative]);
  const dismiss=()=>{if(!closable)return;void report('dismiss');setDelivery(null);};
  const openDestination=async()=>{const d=creative?.destination;if(!d||!destinationValid)return;try{await report('cta_click');if(d.type==='https'&&d.url)await Linking.openURL(d.url);else if(d.merchant_id)router.push({pathname:'/(marketplace)/merchant',params:{id:d.merchant_id,product:d.product_id}} as any);setDelivery(null);}catch{await report('destination_error');}};
  if(!enabled||!delivery)return null;
  return <Modal visible transparent animationType="fade" onRequestClose={dismiss}><View style={s.overlay}><View style={s.card}>{closable?<TouchableOpacity accessibilityLabel="Cerrar publicidad" style={s.close} onPress={dismiss}><Ionicons name="close" size={23} color="#202124"/></TouchableOpacity>:<View style={s.countdown}><Text style={s.countdownText}>{remaining}</Text></View>}<Text style={s.sponsor}>{creative?.sponsor_label||'PUBLICIDAD'}</Text>{creative?.format==='video'&&creative.media_url?<CampaignVideo uri={creative.media_url} poster={creative.poster_url} onEvent={report}/>:creative?.media_url?<Image source={{uri:creative.media_url}} style={s.media} resizeMode="cover" onError={()=>void report('media_error')}/>:<View style={s.productArt}><Ionicons name="bag-handle" size={46} color="#FF7733"/></View>}<View style={s.copy}>{!!creative?.title&&<Text style={s.title}>{creative.title}</Text>}{!!creative?.body&&<Text style={s.body}>{creative.body}</Text>}</View>{creative?.cta_text&&destinationValid&&<TouchableOpacity style={s.cta} onPress={openDestination}><Text style={s.ctaText}>{creative.cta_text}</Text><Ionicons name="arrow-forward" size={18} color="#FFF"/></TouchableOpacity>}</View></View></Modal>;
}

const s=StyleSheet.create({overlay:{flex:1,backgroundColor:'rgba(15,16,18,.72)',alignItems:'center',justifyContent:'center',padding:20},card:{width:'100%',maxWidth:430,maxHeight:'88%',backgroundColor:'#FFF',borderRadius:24,overflow:'hidden',paddingBottom:20},close:{position:'absolute',right:12,top:12,zIndex:3,width:40,height:40,borderRadius:20,backgroundColor:'rgba(255,255,255,.94)',alignItems:'center',justifyContent:'center'},countdown:{position:'absolute',right:14,top:14,zIndex:3,width:38,height:38,borderRadius:19,backgroundColor:'rgba(32,33,36,.86)',alignItems:'center',justifyContent:'center'},countdownText:{color:'#FFF',fontSize:15,fontWeight:'900'},sponsor:{fontSize:10,fontWeight:'900',letterSpacing:1.2,color:'#FF7733',paddingHorizontal:20,paddingTop:18,paddingBottom:10},media:{width:'100%',height:230,backgroundColor:'#202124'},productArt:{height:180,backgroundColor:'#FFF0EC',alignItems:'center',justifyContent:'center'},copy:{paddingHorizontal:20,paddingTop:17},title:{fontSize:22,lineHeight:27,fontWeight:'900',color:'#202124'},body:{fontSize:14,lineHeight:21,color:'#656A70',marginTop:7},cta:{marginHorizontal:20,marginTop:18,backgroundColor:'#FF7733',padding:16,borderRadius:15,flexDirection:'row',gap:8,alignItems:'center',justifyContent:'center'},ctaText:{color:'#FFF',fontSize:15,fontWeight:'800'}});
