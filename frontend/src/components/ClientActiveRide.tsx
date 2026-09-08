import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiService } from '@/src/services/api';
import { socketService } from '@/src/services/socket';
import { useAuthStore } from '@/src/stores/authStore';
import { useRideStore } from '@/src/stores/rideStore';

type RideSummary={kind:'request'|'ride';status:string;title:string;detail:string};

export default function ClientActiveRide(){
  const router=useRouter(); const user=useAuthStore(s=>s.user); const [summary,setSummary]=useState<RideSummary|null>(null);
  const {setCurrentRide}=useRideStore();
  const refresh=useCallback(async()=>{
    try{
      const active=await apiService.get('/rides/active');
      if(active.ride&&['accepted','arrived','started'].includes(active.ride.status)){
        setCurrentRide(active.ride);
        const labels:any={accepted:'Tu conductor está en camino',arrived:'Tu conductor llegó',started:'Viaje en curso'};
        setSummary({kind:'ride',status:active.ride.status,title:labels[active.ride.status],detail:active.ride.driver_info?.name||'Tocá para ver el viaje'}); return;
      }
      const pending=await apiService.get('/rides/request/active'); const req=pending.request;
      if(req){const name=req.reviewing_driver?.name?.split(' ')[0];setSummary({kind:'request',status:name?'reviewing':'searching',title:name?`${name} está viendo tu viaje`:'Buscando conductor',detail:name?'Te avisamos cuando responda':'Podés seguir usando Moli'});return;}
      setSummary(null);
    }catch{}
  },[setCurrentRide]);
  useEffect(()=>{if(!user)return;socketService.connect(user.user_id);refresh();const timer=setInterval(refresh,4000);
    const a=socketService.on('driver_reviewing',(d:any)=>setSummary({kind:'request',status:'reviewing',title:d.message||`${d.driver_name||'Un conductor'} está viendo tu viaje`,detail:'Te avisamos cuando responda'}));
    const b=socketService.on('driver_review_ended',()=>setSummary({kind:'request',status:'searching',title:'Buscando otro conductor',detail:'Seguimos buscando cerca tuyo'}));
    const c=socketService.on('ride_accepted',()=>refresh()); const d=socketService.on('ride_status_update',()=>refresh());
    return()=>{clearInterval(timer);a();b();c();d();};},[user,refresh]);
  if(!summary)return null;
  const active=summary.kind==='ride';
  return <TouchableOpacity activeOpacity={.9} style={s.card} onPress={()=>router.push('/solicitar-viaje')}>
    <View style={[s.icon,active&&s.iconActive]}><Ionicons name={active?'car-sport':'radio'} size={24} color="#fff"/></View>
    <View style={s.copy}><Text style={s.eyebrow}>{active?'VIAJE ACTIVO':'SOLICITUD EN CURSO'}</Text><Text style={s.title} numberOfLines={1}>{summary.title}</Text><Text style={s.detail} numberOfLines={1}>{summary.detail}</Text></View>
    <Ionicons name="chevron-forward" size={22} color="#FF5A1F"/>
  </TouchableOpacity>;
}
const s=StyleSheet.create({card:{position:'absolute',left:16,right:16,bottom:18,minHeight:82,borderRadius:23,backgroundColor:'#202124',padding:12,flexDirection:'row',alignItems:'center',shadowColor:'#5B250D',shadowOffset:{width:0,height:8},shadowOpacity:.3,shadowRadius:14,elevation:12,borderWidth:1,borderColor:'#3A3532'},icon:{width:52,height:52,borderRadius:18,backgroundColor:'#FF5A1F',alignItems:'center',justifyContent:'center'},iconActive:{backgroundColor:'#14B866'},copy:{flex:1,paddingHorizontal:12},eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.1,color:'#FF9568'},title:{fontSize:15,fontWeight:'900',color:'#fff',marginTop:2},detail:{fontSize:11,color:'#C9C5C2',marginTop:3}});
