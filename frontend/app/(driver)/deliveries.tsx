import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiService } from '@/src/services/api';
import { MOLI_COLORS as C, MOLI_RADIUS as R, MOLI_SHADOWS as SH } from '@/src/theme/colors';

type DeliveryCard = {
  delivery_id: string;
  order_id: string;
  status: 'offering'|'assigned'|'picked_up'|'delivering'|'completed';
  merchant: { name: string; address: string };
  destination?: { address?: string; zone?: string };
  pricing: { delivery_fee_cents: number; currency: string };
  assigned_to_me: boolean;
};

const statusLabel: Record<string,string> = {
  offering:'Oferta disponible', assigned:'Asignada', picked_up:'Pedido retirado',
  delivering:'En camino', completed:'Entregada',
};
const next: Record<string,{status:string;label:string;icon:React.ComponentProps<typeof Ionicons>['name']}> = {
  assigned:{status:'picked_up',label:'Confirmar retiro',icon:'bag-check-outline'},
  picked_up:{status:'delivering',label:'Iniciar entrega',icon:'navigate-outline'},
  delivering:{status:'completed',label:'Confirmar entrega',icon:'checkmark-circle-outline'},
};

export default function DriverDeliveriesScreen(){
  const router=useRouter();
  const {activity}=useLocalSearchParams<{activity?:string}>();
  const [items,setItems]=useState<DeliveryCard[]>([]);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [busy,setBusy]=useState<string|null>(null);
  const [message,setMessage]=useState('');
  const parcel=activity==='parcel';

  const load=useCallback(async()=>{
    try{const res=await apiService.get('/marketplace/deliveries/driver/inbox');setItems(res.deliveries||[]);setMessage('');}
    catch(e:any){setMessage(e.message||'No pudimos cargar las entregas.');}
    finally{setLoading(false);setRefreshing(false);}
  },[]);
  useEffect(()=>{load();const timer=setInterval(load,10000);return()=>clearInterval(timer);},[load]);

  const accept=async(item:DeliveryCard)=>{setBusy(item.delivery_id);try{await apiService.post(`/marketplace/deliveries/${item.delivery_id}/accept`,{});await load();}catch(e:any){setMessage(e.message||'La oferta ya no está disponible.');}finally{setBusy(null);}};
  const advance=async(item:DeliveryCard)=>{const action=next[item.status];if(!action)return;setBusy(item.delivery_id);try{await apiService.put(`/marketplace/deliveries/${item.delivery_id}/status`,{status:action.status});await load();}catch(e:any){setMessage(e.message||'No pudimos actualizar la entrega.');}finally{setBusy(null);}};
  const money=(cents:number)=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(cents/100);

  return <SafeAreaView style={s.page}>
    <View style={s.header}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Volver" style={s.back} onPress={()=>router.back()}><Ionicons name="arrow-back" size={22} color={C.black}/></TouchableOpacity><View style={{flex:1}}><Text style={s.eyebrow}>BANDEJA ÚNICA</Text><Text style={s.title}>{parcel?'Paquetería y envíos':'Delivery Moli'}</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="Actualizar entregas" style={s.refresh} onPress={()=>{setRefreshing(true);load();}}><Ionicons name="refresh" size={21} color="#FF7733"/></TouchableOpacity></View>
    <View style={s.notice}><Ionicons name={parcel?'cube-outline':'bicycle-outline'} size={22} color="#FF7733"/><View style={{flex:1}}><Text style={s.noticeTitle}>{parcel?'Envíos punto a punto':'Pedidos de comercios'}</Text><Text style={s.noticeCopy}>{parcel?'Tus próximos envíos aparecerán en esta bandeja junto con el reparto de comercios.':'La dirección final se habilita solamente después de aceptar.'}</Text></View></View>
    {message?<View style={s.error}><Text style={s.errorText}>{message}</Text></View>:null}
    {loading?<ActivityIndicator style={{marginTop:48}} color="#FF7733"/>:<ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load();}}/>} contentContainerStyle={s.list}>
      {!items.length?<View style={s.empty}><View style={s.emptyIcon}><Ionicons name="notifications-outline" size={34} color="#FF7733"/></View><Text style={s.emptyTitle}>No hay entregas por ahora</Text><Text style={s.emptyCopy}>Cuando un comercio tenga un pedido listo, la oferta aparecerá acá. Las motos tienen prioridad en la primera ronda.</Text></View>:items.map(item=>{const action=next[item.status];return <View key={item.delivery_id} style={s.card}><View style={s.cardTop}><View style={s.kind}><Ionicons name="storefront-outline" size={19} color="#FF7733"/><Text style={s.kindText}>{item.merchant.name}</Text></View><Text style={s.status}>{statusLabel[item.status]||item.status}</Text></View><View style={s.route}><View style={s.routeDot}/><View style={{flex:1}}><Text style={s.routeLabel}>Retiro</Text><Text style={s.routeValue}>{item.merchant.address||'Dirección del comercio'}</Text></View></View><View style={s.route}><View style={[s.routeDot,{backgroundColor:'#202124'}]}/><View style={{flex:1}}><Text style={s.routeLabel}>Entrega</Text><Text style={s.routeValue}>{item.destination?.address||item.destination?.zone||'Se muestra después de aceptar'}</Text></View></View><View style={s.bottom}><View><Text style={s.feeLabel}>Ganancia estimada</Text><Text style={s.fee}>{money(item.pricing.delivery_fee_cents)}</Text></View>{item.status==='offering'?<TouchableOpacity accessibilityRole="button" style={s.primary} disabled={busy===item.delivery_id} onPress={()=>accept(item)}>{busy===item.delivery_id?<ActivityIndicator color="#FFF"/>:<Text style={s.primaryText}>Aceptar</Text>}</TouchableOpacity>:action?<TouchableOpacity accessibilityRole="button" style={s.primary} disabled={busy===item.delivery_id} onPress={()=>advance(item)}><Ionicons name={action.icon} size={18} color="#FFF"/><Text style={s.primaryText}>{action.label}</Text></TouchableOpacity>:null}</View></View>})}
    </ScrollView>}
  </SafeAreaView>;
}

const s=StyleSheet.create({page:{flex:1,backgroundColor:'#F7F4F1'},header:{paddingHorizontal:18,paddingVertical:14,flexDirection:'row',alignItems:'center',gap:12},back:{width:42,height:42,borderRadius:21,backgroundColor:'#FFF',alignItems:'center',justifyContent:'center',...SH.sm},refresh:{width:42,height:42,borderRadius:21,backgroundColor:'#FFF',alignItems:'center',justifyContent:'center'},eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.3,color:'#FF7733'},title:{fontSize:24,fontWeight:'900',color:'#202124'},notice:{marginHorizontal:18,padding:16,borderRadius:R.lg,backgroundColor:'#FFF0EC',flexDirection:'row',gap:12,alignItems:'center'},noticeTitle:{fontSize:14,fontWeight:'900',color:'#202124'},noticeCopy:{fontSize:11,lineHeight:16,color:'#70757A',marginTop:2},error:{margin:18,marginBottom:0,padding:12,borderRadius:12,backgroundColor:'#FFE8E6'},errorText:{color:'#B42318',fontSize:12,fontWeight:'700'},list:{padding:18,paddingBottom:40,gap:12},empty:{alignItems:'center',backgroundColor:'#FFF',borderRadius:R.xl,padding:30,...SH.sm},emptyIcon:{width:64,height:64,borderRadius:22,backgroundColor:'#FFF0EC',alignItems:'center',justifyContent:'center'},emptyTitle:{fontSize:18,fontWeight:'900',color:'#202124',marginTop:14},emptyCopy:{fontSize:13,lineHeight:19,textAlign:'center',color:'#70757A',marginTop:6},card:{padding:17,borderRadius:R.xl,backgroundColor:'#FFF',...SH.sm},cardTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},kind:{flexDirection:'row',alignItems:'center',gap:8,flex:1},kindText:{fontSize:15,fontWeight:'900',color:'#202124'},status:{fontSize:10,fontWeight:'900',color:'#D84229',backgroundColor:'#FFF0EC',paddingHorizontal:9,paddingVertical:5,borderRadius:12},route:{flexDirection:'row',alignItems:'center',gap:10,marginTop:14},routeDot:{width:10,height:10,borderRadius:5,backgroundColor:'#FF7733'},routeLabel:{fontSize:10,color:'#92969B'},routeValue:{fontSize:13,fontWeight:'700',color:'#34373B',marginTop:2},bottom:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderTopWidth:1,borderTopColor:'#F0ECE8',marginTop:16,paddingTop:14},feeLabel:{fontSize:10,color:'#92969B'},fee:{fontSize:18,fontWeight:'900',color:'#202124'},primary:{minHeight:44,paddingHorizontal:17,borderRadius:14,backgroundColor:'#FF7733',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},primaryText:{color:'#FFF',fontSize:13,fontWeight:'900'}});
