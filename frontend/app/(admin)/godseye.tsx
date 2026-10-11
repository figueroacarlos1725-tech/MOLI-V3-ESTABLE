import React,{useCallback,useRef,useState} from 'react';
import {ActivityIndicator,Image,SafeAreaView,ScrollView,StyleSheet,Switch,Text,TextInput,TouchableOpacity,View} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {apiService} from '@/src/services/api';
import {socketService} from '@/src/services/socket';
import {useAuthStore} from '@/src/stores/authStore';
import FleetMap,{FleetPoint} from '@/src/components/FleetMap';
import {FLEET_ICONS,fleetIconKey,fleetIconUrl} from '@/src/utils/fleetIcons';

type Provider={provider_id:string;name:string;provider_type:string;activity?:string;vehicle_type?:string;category?:string;is_professional?:boolean;vehicle_id?:string;plate_number?:string;latitude?:number;longitude?:number;updated_at?:string;is_online:boolean;is_available:boolean;is_blocked?:boolean;active_ride?:any;active_job?:any;active_delivery?:any};
const zone='America/Argentina/Buenos_Aires';
function today(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(type=>parts.find(part=>part.type===type)?.value).join('-');}
function when(value?:string){if(!value)return'Sin reporte GPS';const date=new Date(value);return Number.isNaN(date.getTime())?'Sin hora válida':new Intl.DateTimeFormat('es-AR',{timeZone:zone,day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(date);}
function parseLocal(value:string){
 const match=/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(value.trim());
 if(!match)throw new Error('Usá fecha y hora con formato AAAA-MM-DD HH:mm.');
 const[y,m,d,h,min]=match.slice(1).map(Number),check=new Date(Date.UTC(y,m-1,d,h,min));
 if(check.getUTCFullYear()!==y||check.getUTCMonth()!==m-1||check.getUTCDate()!==d||check.getUTCHours()!==h||check.getUTCMinutes()!==min)throw new Error('La fecha o la hora no es válida.');
 return new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00-03:00`).toISOString();
}

export default function GodsEye(){
 const{user}=useAuthStore();
 const[providers,setProviders]=useState<Provider[]>([]),[selected,setSelected]=useState<string|null>(null),[filter,setFilter]=useState('all');
 const[loading,setLoading]=useState(true),[connected,setConnected]=useState(false),[error,setError]=useState('');
 const[from,setFrom]=useState(`${today()} 00:00`),[to,setTo]=useState(`${today()} 23:59`),[day,setDay]=useState(today());
 const[points,setPoints]=useState<FleetPoint[]>([]),[trajectoryBusy,setTrajectoryBusy]=useState(false),[trajectoryNotice,setTrajectoryNotice]=useState(''),[historyMode,setHistoryMode]=useState(false);
 const[onlyVehicle,setOnlyVehicle]=useState(true);
 const mounted=useRef(false),request=useRef(0),trajectoryRequest=useRef(0);
 const load=useCallback(async()=>{const turn=++request.current;try{const result=await apiService.get('/admin/fleet/live');if(mounted.current&&turn===request.current){setProviders(result.providers||[]);setError('');}}catch(e:any){if(mounted.current)setError(e.message||'No pudimos cargar la flota.');}finally{if(mounted.current)setLoading(false);}},[]);
 useFocusEffect(useCallback(()=>{
  mounted.current=true;void load();if(user?.user_id)void socketService.connect(user.user_id);setConnected(socketService.isConnected);
  const offLocation=socketService.on('fleet_location',(data:any)=>{
   if(!data.provider_id||!Number.isFinite(data.latitude)||!Number.isFinite(data.longitude))return;
   setConnected(true);setProviders(old=>{const index=old.findIndex(provider=>provider.provider_id===data.provider_id);if(index<0){void load();return old;}const copy=old.slice();copy[index]={...copy[index],...data};return copy;});
  });
  const offChanged=socketService.on('fleet_changed',()=>{void load();});
  const offConnected=socketService.on('transport_connected',()=>{setConnected(true);void load();});
  const offDisconnected=socketService.on('transport_disconnected',()=>setConnected(false));
  return()=>{mounted.current=false;request.current++;trajectoryRequest.current++;offLocation();offChanged();offConnected();offDisconnected();};
 },[load,user?.user_id]));
 const current=providers.find(provider=>provider.provider_id===selected);
 const visible=providers.filter(provider=>filter==='all'||filter==='online'&&provider.is_online||filter==='offline'&&!provider.is_online||filter==='busy'&&!!(provider.active_ride||provider.active_job||provider.active_delivery)||filter==='professional'&&(provider.provider_type==='professional'||provider.is_professional));
 const mapProviders=historyMode?[]:visible;
 const markers=mapProviders.filter(provider=>Number.isFinite(provider.latitude)&&Number.isFinite(provider.longitude)).map(provider=>({id:provider.provider_id,latitude:provider.latitude!,longitude:provider.longitude!,title:`${provider.name} · ${provider.activity||provider.vehicle_type||provider.provider_type} · GPS ${when(provider.updated_at)}`,vehicleType:provider.vehicle_type,provider_type:provider.provider_type,activity:provider.activity,is_online:provider.is_online,iconUrl:fleetIconUrl(provider)}));
 const choose=(id:string)=>{setSelected(id);setHistoryMode(false);setPoints([]);setTrajectoryBusy(false);setTrajectoryNotice('');trajectoryRequest.current++;};
 const trajectory=async(useDay=false)=>{
  if(!selected){setTrajectoryNotice('Elegí un vehículo o prestador.');return;}
  const turn=++trajectoryRequest.current;setTrajectoryNotice('');setTrajectoryBusy(true);setPoints([]);setHistoryMode(true);
  try{
   const fromTime=parseLocal(useDay?`${day} 00:00`:from),toTime=parseLocal(useDay?`${day} 23:59`:to);
   if(new Date(toTime)<=new Date(fromTime))throw new Error('Hasta debe ser posterior a Desde.');
   const params=new URLSearchParams({from_time:fromTime,to_time:useDay?new Date(new Date(toTime).getTime()+59999).toISOString():toTime});
   if(onlyVehicle&&current?.vehicle_id)params.set('vehicle_id',current.vehicle_id);
   const result=await apiService.get(`/admin/fleet/${encodeURIComponent(selected)}/trajectory?${params}`);
   if(turn!==trajectoryRequest.current||!mounted.current)return;
   setPoints(result.points||[]);setTrajectoryNotice(result.count?`${result.count} puntos registrados. Retención: ${result.retention_days} días.${result.truncated?' Resultado limitado: reducí el intervalo para ver todos los puntos.':''}`:'No hay ubicaciones registradas en ese intervalo. El historial comienza desde esta implementación y depende de los reportes del teléfono.');
  }catch(e:any){if(turn===trajectoryRequest.current)setTrajectoryNotice(e.message||'No se pudo consultar la trayectoria.');}
  finally{if(turn===trajectoryRequest.current)setTrajectoryBusy(false);}
 };
 return <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
  <View style={s.row}><Text style={s.title}>Ojo de Dios</Text><Text style={{color:connected?'#098A5A':'#B42318'}}>{connected?'● Conectado en vivo':'● Conexión en vivo pendiente'}</Text></View>
  <Text>Actualización por eventos de ubicación. La frecuencia depende del teléfono; GPS en segundo plano aún pendiente.</Text>
  {!!error&&<Text style={s.error}>{error}</Text>}
  <TouchableOpacity accessibilityRole="button" onPress={load} style={s.secondary}><Text>Recuperar estado de flota</Text></TouchableOpacity>
  <View style={s.row}>{[['all','Todos'],['online','Conectados'],['busy','En servicio'],['professional','Profesionales'],['offline','Desconectados']].map(([value,label])=><TouchableOpacity accessibilityRole="button" key={value} onPress={()=>setFilter(value)} style={[s.chip,filter===value&&s.chipOn]}><Text>{label}</Text></TouchableOpacity>)}</View>
  <View style={s.row}>{(['car','moto','professional','paperwork','delivery'] as const).map((key,index)=><View key={key} style={{alignItems:'center',padding:6}}><Image source={FLEET_ICONS[key]} style={{width:42,height:42}} resizeMode="contain"/><Text>{['Auto / Taxi','Moto','Profesionales','Trámites','Delivery / Envíos'][index]}</Text></View>)}</View>
  {loading?<ActivityIndicator/>:<FleetMap markers={markers} trajectory={historyMode?points:[]} selectedId={historyMode?undefined:selected||undefined} onSelect={choose} style={{height:400}}/>}
  <Text>El punto es el último GPS recibido. Revisá su hora; un punto antiguo no confirma la ubicación actual.</Text>
  {!!current&&<View style={s.card}>
   <View style={s.row}><Image source={FLEET_ICONS[fleetIconKey(current)]} style={{width:48,height:48}} resizeMode="contain"/><Text style={s.subtitle}>{current.name}{current.plate_number?` · ${current.plate_number}`:''}</Text></View><Text>{current.activity||current.vehicle_type||current.provider_type} · {current.is_online?'Conectado':'Desconectado'} · GPS {when(current.updated_at)}</Text>
   <Text style={s.subtitle}>Trayectoria para revisar un reclamo</Text><Text>Horarios de Argentina (UTC−3). Seleccioná día o intervalo de hasta 7 días.</Text>
   {!!current.vehicle_id&&<View style={s.row}><Text>Solo este vehículo ({current.plate_number||current.vehicle_id})</Text><Switch accessibilityLabel="Solo este vehículo" value={onlyVehicle} onValueChange={setOnlyVehicle}/></View>}
   <Text>Día (AAAA-MM-DD)</Text><TextInput accessibilityLabel="Día de trayectoria" value={day} onChangeText={setDay} style={s.input}/>
   <TouchableOpacity accessibilityRole="button" disabled={trajectoryBusy} onPress={()=>{void trajectory(true);}} style={s.primary}><Text style={s.primaryText}>Ver trayectoria del día</Text></TouchableOpacity>
   <Text>Desde (AAAA-MM-DD HH:mm)</Text><TextInput accessibilityLabel="Desde de trayectoria" value={from} onChangeText={setFrom} style={s.input}/>
   <Text>Hasta (AAAA-MM-DD HH:mm)</Text><TextInput accessibilityLabel="Hasta de trayectoria" value={to} onChangeText={setTo} style={s.input}/>
   <TouchableOpacity accessibilityRole="button" disabled={trajectoryBusy} onPress={()=>{void trajectory();}} style={s.primary}><Text style={s.primaryText}>{trajectoryBusy?'Consultando…':'Ver intervalo'}</Text></TouchableOpacity>
   <TouchableOpacity accessibilityRole="button" onPress={()=>{trajectoryRequest.current++;setTrajectoryBusy(false);setHistoryMode(false);setPoints([]);setTrajectoryNotice('');}} style={s.secondary}><Text>Volver a flota en vivo</Text></TouchableOpacity>
   {!!trajectoryNotice&&<Text accessibilityLiveRegion="polite">{trajectoryNotice}</Text>}
   {!!points.length&&<Text>Primer reporte: {when(points[0].occurred_at)} · Último: {when(points[points.length-1].occurred_at)}. La línea une muestras GPS; no certifica cada tramo de calle recorrido.</Text>}
  </View>}
  <Text style={s.subtitle}>Vehículos y prestadores ({visible.length})</Text>
  {visible.map(provider=><TouchableOpacity accessibilityRole="button" key={provider.provider_id} onPress={()=>choose(provider.provider_id)} style={[s.card,selected===provider.provider_id&&{borderColor:'#FF7733',borderWidth:2}]}><View style={s.row}><Image source={FLEET_ICONS[fleetIconKey(provider)]} style={{width:48,height:48}} resizeMode="contain"/><Text style={s.subtitle}>{provider.name}{provider.plate_number?` · ${provider.plate_number}`:''}</Text></View><Text>{provider.activity||provider.vehicle_type||provider.provider_type} · {provider.is_online?'Conectado':'Desconectado'} · {provider.is_blocked?'Bloqueado':!provider.is_online?'Fuera de servicio':provider.is_available?'Disponible':'No disponible'}</Text><Text>GPS: {when(provider.updated_at)}</Text><Text>Ver ubicación y trayectoria</Text></TouchableOpacity>)}
 </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#F7F5F2'},body:{padding:20,gap:12},row:{flexDirection:'row',alignItems:'center',gap:10,flexWrap:'wrap'},title:{fontSize:28,fontWeight:'800',flex:1},subtitle:{fontSize:18,fontWeight:'700'},card:{backgroundColor:'#FFF',borderRadius:16,padding:18,gap:10},chip:{padding:12,minHeight:44,backgroundColor:'#EEE',borderRadius:12},chipOn:{backgroundColor:'#FFD7BC'},input:{borderWidth:1,borderColor:'#DDD',padding:12,minHeight:48,borderRadius:12},primary:{padding:15,minHeight:48,backgroundColor:'#FF7733',borderRadius:12},primaryText:{color:'#FFF',fontWeight:'700'},secondary:{padding:14,minHeight:48,backgroundColor:'#EEE',borderRadius:12},error:{color:'#B42318'}});
