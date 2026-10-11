import { ProviderManagementCard } from '@/src/components/ProviderManagementCard';
import React,{useCallback,useState} from 'react';
import {ActivityIndicator,Modal,SafeAreaView,ScrollView,Switch,Text,TextInput,TouchableOpacity,View} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {apiService} from '@/src/services/api';
import {operatorAlert} from '@/src/components/OperatorAlert';

type Merchant={merchant_id:string;owner_id?:string;name:string;address:string;approval_status:string;capabilities?:{pickup:boolean;delivery:boolean};delivery_fee_cents?:number};
export default function AdminMerchants(){
 const[shops,setShops]=useState<Merchant[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[selected,setSelected]=useState<Merchant|null>(null);
 const[pickup,setPickup]=useState(true),[delivery,setDelivery]=useState(false),[fee,setFee]=useState('0'),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{try{const result=await apiService.get('/marketplace/admin/merchants');setShops(result.merchants||[]);setError('');}catch(e:any){setError(e.message||'No se pudieron cargar los comercios.');}finally{setLoading(false);}},[]);
 useFocusEffect(useCallback(()=>{void load();},[load]));
 const open=(shop:Merchant)=>{setSelected(shop);setPickup(shop.capabilities?.pickup??true);setDelivery(shop.capabilities?.delivery??false);setFee(String((shop.delivery_fee_cents||0)/100));};
 const decide=async(approved:boolean)=>{
  if(!selected||busy)return;
  const amount=Number(fee);
  if(!Number.isFinite(amount)||amount<0){operatorAlert('Importe inválido','Ingresá un costo de entrega válido, igual o mayor a cero.');return;}
  if(approved&&!pickup&&!delivery){operatorAlert('Faltan modalidades','Activá retiro o delivery.');return;}
  setBusy(true);
  try{await apiService.put(`/marketplace/admin/merchants/${selected.merchant_id}/approval`,{approved,pickup,delivery,delivery_fee_cents:Math.round(amount*100)});setSelected(null);await load();operatorAlert('Comercio actualizado',approved?'La aprobación y las modalidades quedaron guardadas.':'El comercio quedó rechazado.');}
  catch(e:any){operatorAlert('No se pudo guardar',e.message||'Revisá los datos.');}finally{setBusy(false);}
 };
 return <SafeAreaView style={{flex:1,backgroundColor:'#F7F5F2'}}><ScrollView contentContainerStyle={{padding:20,gap:12}}>
  <Text style={{fontSize:28,fontWeight:'800'}}>Comercios</Text><Text>Revisión y modalidades de marketplace · hasta 200 comercios</Text>
  {!!error&&<Text style={{color:'#B42318'}}>{error}</Text>}
  <TouchableOpacity accessibilityRole="button" onPress={load} style={{padding:14,minHeight:48}}><Text>Actualizar comercios</Text></TouchableOpacity>
  {loading?<ActivityIndicator/>:shops.length===0?<Text>No hay comercios registrados.</Text>:shops.map(shop=><TouchableOpacity accessibilityRole="button" key={shop.merchant_id} onPress={()=>open(shop)} style={{padding:18,backgroundColor:'#FFF',borderRadius:16,gap:8}}><Text style={{fontSize:18,fontWeight:'700'}}>{shop.name}</Text><Text>{shop.address}</Text><Text>Estado: {shop.approval_status}</Text><Text>{shop.capabilities?.pickup?'Retiro habilitado':'Sin retiro'} · {shop.capabilities?.delivery?'Delivery habilitado':'Sin delivery'}</Text><Text>Revisar comercio</Text></TouchableOpacity>)}
 </ScrollView><Modal visible={!!selected} transparent animationType="fade" onRequestClose={()=>{if(!busy)setSelected(null);}}><View style={{flex:1,backgroundColor:'rgba(0,0,0,.5)',padding:20,alignItems:'center',justifyContent:'center'}}><ScrollView style={{maxHeight:'90%',width:'100%',maxWidth:480,backgroundColor:'#FFF',borderRadius:20}} contentContainerStyle={{padding:22,gap:14}} keyboardShouldPersistTaps="handled">
  <Text style={{fontSize:22,fontWeight:'800'}}>{selected?.name}</Text><Text>Revisá los datos y la documentación antes de decidir.</Text>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text>Retiro en comercio</Text><Switch accessibilityLabel="Retiro en comercio" disabled={busy} value={pickup} onValueChange={setPickup}/></View>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text>Delivery</Text><Switch accessibilityLabel="Delivery" disabled={busy} value={delivery} onValueChange={setDelivery}/></View>
  <Text>Costo de entrega en pesos</Text><TextInput accessibilityLabel="Costo de entrega en pesos" value={fee} onChangeText={setFee} keyboardType="decimal-pad" editable={!busy} style={{minHeight:48,borderWidth:1,borderColor:'#DDD',borderRadius:12,padding:12}}/>
  <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={()=>operatorAlert('Aprobar comercio','¿Confirmás la aprobación y las modalidades seleccionadas?',[{text:'Volver',style:'cancel'},{text:'Confirmar aprobación',onPress:()=>{void decide(true);}}])} style={{padding:16,minHeight:48,backgroundColor:'#FF7733',borderRadius:12}}><Text style={{color:'#FFF',fontWeight:'700'}}>{busy?'Guardando…':'Aprobar y guardar'}</Text></TouchableOpacity>
  <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={()=>operatorAlert('Rechazar comercio','El comercio dejará de estar aprobado.',[{text:'Volver',style:'cancel'},{text:'Confirmar rechazo',style:'destructive',onPress:()=>{void decide(false);}}])} style={{padding:16,minHeight:48}}><Text style={{color:'#B42318'}}>Rechazar comercio</Text></TouchableOpacity>
  {selected?.owner_id&&<ProviderManagementCard userId={selected.owner_id} showAccount onChanged={load}/>}
  <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={()=>setSelected(null)} style={{padding:16,minHeight:48}}><Text>Cerrar revisión</Text></TouchableOpacity>
 </ScrollView></View></Modal></SafeAreaView>;
}
