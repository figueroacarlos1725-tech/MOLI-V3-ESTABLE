import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, Switch, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/src/services/api';
import { confirmAlert } from '@/src/utils/alert';

interface Trip {
  ride_id: string; rider_name?: string; driver_name?: string;
  status: string; trip_type?: string; is_manual?: boolean;
  is_ticketera?: boolean; fare?: number;
  pickup_location?: any; dropoff_location?: any;
  vehicle_type?: string; notes?: string; created_at?: string;
}

const STATUS_COLORS: Record<string,string> = {
  requested:'#3B82F6',accepted:'#F59E0B',arrived:'#8B5CF6',
  started:'#10B981',completed:'#00C853',cancelled:'#EF4444',
};

export default function AdminTripsScreen() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [drivers, setDrivers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    trip_type: 'full',
    rider_name: '', rider_phone: '',
    pickup_address: '', pickup_lat: '', pickup_lng: '',
    dropoff_address: '', dropoff_lat: '', dropoff_lng: '',
    vehicle_type: 'economy',
    assigned_driver_id: '',
    notes: '',
  });

  useEffect(() => { fetchTrips(); fetchDrivers(); }, [statusFilter]);

  const fetchTrips = async () => {
    setLoading(true);
    try {
      let url = '/admin/trips?limit=30';
      if (statusFilter) url += `&status=${statusFilter}`;
      const r = await apiService.get(url);
      setTrips(r.rides || []);
    } catch (e) {} finally { setLoading(false); }
  };

  const fetchDrivers = async () => {
    try {
      const r = await apiService.get('/admin/users?user_type=driver&limit=50');
      setDrivers(r.users || []);
    } catch (e) {}
  };

  const handleCreate = async () => {
    if (!form.rider_name && !form.rider_phone) {
      if (Platform.OS === 'web') window.alert('Ingresa nombre o telefono del pasajero');
      return;
    }
    setSaving(true);
    try {
      const body: any = {
        trip_type: form.trip_type,
        rider_name: form.rider_name,
        rider_phone: form.rider_phone,
        pickup_address: form.pickup_address,
        dropoff_address: form.dropoff_address,
        vehicle_type: form.vehicle_type,
        notes: form.notes,
      };
      if (form.pickup_lat) body.pickup_latitude = parseFloat(form.pickup_lat);
      if (form.pickup_lng) body.pickup_longitude = parseFloat(form.pickup_lng);
      if (form.dropoff_lat) body.dropoff_latitude = parseFloat(form.dropoff_lat);
      if (form.dropoff_lng) body.dropoff_longitude = parseFloat(form.dropoff_lng);
      if (form.assigned_driver_id) body.assigned_driver_id = form.assigned_driver_id;

      const r = await apiService.post('/admin/trips/manual', body);
      
      if (Platform.OS === 'web') window.alert(r.message || 'Viaje creado');
      setShowCreate(false);
      resetForm();
      fetchTrips();
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert(e.message || 'Error creando viaje');
    } finally { setSaving(false); }
  };

  const resetForm = () => {
    setForm({trip_type:'full',rider_name:'',rider_phone:'',pickup_address:'',pickup_lat:'',pickup_lng:'',dropoff_address:'',dropoff_lat:'',dropoff_lng:'',vehicle_type:'economy',assigned_driver_id:'',notes:''});
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Viajes</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowCreate(true)}>
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={s.addBtnText}>Crear Manual</Text>
        </TouchableOpacity>
      </View>

      <View style={s.filterRow}>
        {['','requested','accepted','started','completed','cancelled'].map(f => (
          <TouchableOpacity key={f} style={[s.filterBtn, statusFilter===f&&s.filterBtnActive]} onPress={() => setStatusFilter(f)}>
            <Text style={[s.filterBtnText, statusFilter===f&&s.filterBtnTextActive]}>
              {f===''?'Todos':f==='requested'?'Pedidos':f==='accepted'?'Aceptados':f==='started'?'En curso':f==='completed'?'Completados':'Cancelados'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? <ActivityIndicator size="large" color="#8E44AD" style={{marginTop:40}} /> :
        <ScrollView contentContainerStyle={s.list}>
          {trips.length === 0 && <Text style={s.empty}>No hay viajes</Text>}
          {trips.map(t => (
            <View key={t.ride_id} style={s.tripCard}>
              <View style={s.tripHeader}>
                <View style={[s.statusBadge,{backgroundColor:(STATUS_COLORS[t.status]||'#999')+'20'}]}>
                  <View style={[s.statusDot,{backgroundColor:STATUS_COLORS[t.status]||'#999'}]} />
                  <Text style={[s.statusText,{color:STATUS_COLORS[t.status]||'#999'}]}>{t.status}</Text>
                </View>
                {t.is_manual && <Text style={s.manualBadge}>MANUAL</Text>}
                {t.is_ticketera && <Text style={s.ticketeraBadge}>TICKETERA</Text>}
                {t.fare != null && <Text style={s.fareText}>${t.fare}</Text>}
              </View>
              <View style={s.tripBody}>
                <Text style={s.tripName}>{t.rider_name || 'Pasajero'} {t.driver_name ? `→ ${t.driver_name}` : ''}</Text>
                {t.pickup_location?.address && <Text style={s.tripAddr}><Ionicons name="location" size={12} color="#00C853" /> {t.pickup_location.address}</Text>}
                {t.dropoff_location?.address && <Text style={s.tripAddr}><Ionicons name="flag" size={12} color="#EF4444" /> {t.dropoff_location.address}</Text>}
                {t.notes ? <Text style={s.tripNotes}>{t.notes}</Text> : null}
                <Text style={s.tripDate}>{t.created_at?.substring(0,16).replace('T',' ')}</Text>
              </View>
            </View>
          ))}
          <View style={{height:40}} />
        </ScrollView>
      }

      {/* Create Manual Trip Modal */}
      <Modal visible={showCreate} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={s.modalTitle}>Crear Viaje Manual</Text>
              <Text style={s.modalSubtitle}>Para pedidos por telefono o WhatsApp</Text>

              <Text style={s.label}>Tipo de viaje</Text>
              <View style={s.radioRow}>
                <TouchableOpacity style={[s.typeBtn, form.trip_type==='full'&&s.typeBtnActive]} onPress={() => setForm({...form,trip_type:'full'})}>
                  <Ionicons name="navigate" size={20} color={form.trip_type==='full'?'#fff':'#666'} />
                  <Text style={[s.typeBtnText, form.trip_type==='full'&&{color:'#fff'}]}>Con origen y destino</Text>
                  <Text style={[s.typeBtnDesc, form.trip_type==='full'&&{color:'#ddd'}]}>Precio fijo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.typeBtn, form.trip_type==='destination_only'&&s.typeBtnActive]} onPress={() => setForm({...form,trip_type:'destination_only'})}>
                  <Ionicons name="speedometer" size={20} color={form.trip_type==='destination_only'?'#fff':'#666'} />
                  <Text style={[s.typeBtnText, form.trip_type==='destination_only'&&{color:'#fff'}]}>Solo origen</Text>
                  <Text style={[s.typeBtnDesc, form.trip_type==='destination_only'&&{color:'#ddd'}]}>Ticketera / Taximetro</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.sectionLabel}>Pasajero</Text>
              <TextInput style={s.input} value={form.rider_name} onChangeText={v => setForm({...form,rider_name:v})} placeholder="Nombre del pasajero" />
              <TextInput style={s.input} value={form.rider_phone} onChangeText={v => setForm({...form,rider_phone:v})} placeholder="Telefono" keyboardType="phone-pad" />

              <Text style={s.sectionLabel}>Origen</Text>
              <TextInput style={s.input} value={form.pickup_address} onChangeText={v => setForm({...form,pickup_address:v})} placeholder="Direccion de recogida" />
              <View style={s.coordRow}>
                <TextInput style={[s.input,{flex:1}]} value={form.pickup_lat} onChangeText={v => setForm({...form,pickup_lat:v})} placeholder="Latitud" keyboardType="numeric" />
                <TextInput style={[s.input,{flex:1}]} value={form.pickup_lng} onChangeText={v => setForm({...form,pickup_lng:v})} placeholder="Longitud" keyboardType="numeric" />
              </View>

              {form.trip_type === 'full' && <>
                <Text style={s.sectionLabel}>Destino</Text>
                <TextInput style={s.input} value={form.dropoff_address} onChangeText={v => setForm({...form,dropoff_address:v})} placeholder="Direccion de destino" />
                <View style={s.coordRow}>
                  <TextInput style={[s.input,{flex:1}]} value={form.dropoff_lat} onChangeText={v => setForm({...form,dropoff_lat:v})} placeholder="Latitud" keyboardType="numeric" />
                  <TextInput style={[s.input,{flex:1}]} value={form.dropoff_lng} onChangeText={v => setForm({...form,dropoff_lng:v})} placeholder="Longitud" keyboardType="numeric" />
                </View>
              </>}

              <Text style={s.sectionLabel}>Servicio</Text>
              <View style={s.radioRow}>
                {['economy','comfort','premium','xl'].map(v => (
                  <TouchableOpacity key={v} style={[s.serviceBtn, form.vehicle_type===v&&s.serviceBtnActive]} onPress={() => setForm({...form,vehicle_type:v})}>
                    <Text style={[s.serviceBtnText, form.vehicle_type===v&&{color:'#fff'}]}>{v==='economy'?'Eco':v==='comfort'?'Confort':v==='premium'?'Premium':'XL'}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.sectionLabel}>Asignar conductor (opcional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.driverList}>
                <TouchableOpacity style={[s.driverChip, !form.assigned_driver_id&&s.driverChipActive]} onPress={() => setForm({...form,assigned_driver_id:''})}>
                  <Text style={[s.driverChipText, !form.assigned_driver_id&&{color:'#fff'}]}>Sin asignar</Text>
                </TouchableOpacity>
                {drivers.map(d => (
                  <TouchableOpacity key={d.user_id} style={[s.driverChip, form.assigned_driver_id===d.user_id&&s.driverChipActive]} onPress={() => setForm({...form,assigned_driver_id:d.user_id})}>
                    <Text style={[s.driverChipText, form.assigned_driver_id===d.user_id&&{color:'#fff'}]}>{d.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TextInput style={[s.input,{height:60}]} value={form.notes} onChangeText={v => setForm({...form,notes:v})} placeholder="Notas adicionales" multiline />

              {form.trip_type === 'destination_only' && (
                <View style={s.infoBox}>
                  <Ionicons name="speedometer" size={18} color="#F59E0B" />
                  <Text style={s.infoBoxText}>Al conductor le aparecera como "Viaje de ticketera" y se activara el taximetro automaticamente</Text>
                </View>
              )}
              {form.trip_type === 'full' && (
                <View style={s.infoBox}>
                  <Ionicons name="cash" size={18} color="#10B981" />
                  <Text style={s.infoBoxText}>Se calculara el precio fijo y se le enviara directamente al conductor</Text>
                </View>
              )}

              <View style={s.modalBtns}>
                <TouchableOpacity style={[s.btn,s.btnCancel]} onPress={() => {setShowCreate(false);resetForm();}}>
                  <Text style={s.btnCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn,s.btnSave]} onPress={handleCreate} disabled={saving}>
                  <Text style={s.btnSaveText}>{saving?'Creando...':'Crear viaje'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:'#F2F2F7'},
  header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:16,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#E5E5EA'},
  title:{fontSize:24,fontWeight:'bold',color:'#1C1C1E'},
  addBtn:{flexDirection:'row',alignItems:'center',backgroundColor:'#8E44AD',paddingHorizontal:14,paddingVertical:8,borderRadius:8,gap:4},
  addBtnText:{color:'#fff',fontWeight:'600',fontSize:13},
  filterRow:{flexDirection:'row',paddingHorizontal:12,paddingVertical:8,gap:6,flexWrap:'wrap'},
  filterBtn:{paddingHorizontal:12,paddingVertical:5,borderRadius:16,backgroundColor:'#E5E5EA'},
  filterBtnActive:{backgroundColor:'#8E44AD'},
  filterBtnText:{fontSize:12,fontWeight:'600',color:'#666'},
  filterBtnTextActive:{color:'#fff'},
  list:{padding:12,gap:10},
  empty:{textAlign:'center',color:'#8E8E93',marginTop:40,fontSize:15},
  tripCard:{backgroundColor:'#fff',borderRadius:12,overflow:'hidden'},
  tripHeader:{flexDirection:'row',alignItems:'center',padding:12,gap:8,borderBottomWidth:1,borderBottomColor:'#F2F2F7'},
  statusBadge:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:10,paddingVertical:4,borderRadius:12},
  statusDot:{width:8,height:8,borderRadius:4},
  statusText:{fontSize:12,fontWeight:'700'},
  manualBadge:{fontSize:10,fontWeight:'700',color:'#8E44AD',backgroundColor:'#F3E8FF',paddingHorizontal:8,paddingVertical:2,borderRadius:8,overflow:'hidden'},
  ticketeraBadge:{fontSize:10,fontWeight:'700',color:'#F59E0B',backgroundColor:'#FEF3C7',paddingHorizontal:8,paddingVertical:2,borderRadius:8,overflow:'hidden'},
  fareText:{fontSize:16,fontWeight:'800',color:'#00C853',marginLeft:'auto'},
  tripBody:{padding:12},
  tripName:{fontSize:14,fontWeight:'600',color:'#1C1C1E'},
  tripAddr:{fontSize:12,color:'#666',marginTop:3},
  tripNotes:{fontSize:11,color:'#F59E0B',fontStyle:'italic',marginTop:4},
  tripDate:{fontSize:10,color:'#C7C7CC',marginTop:6},
  modalOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'center',alignItems:'center',padding:16},
  modalContent:{backgroundColor:'#fff',borderRadius:16,padding:20,width:'100%',maxWidth:520,maxHeight:'90%'},
  modalTitle:{fontSize:22,fontWeight:'bold',color:'#1C1C1E'},
  modalSubtitle:{fontSize:13,color:'#8E8E93',marginBottom:16},
  label:{fontSize:12,fontWeight:'600',color:'#666',marginBottom:6,marginTop:8},
  sectionLabel:{fontSize:13,fontWeight:'700',color:'#8E44AD',marginTop:16,marginBottom:6},
  input:{backgroundColor:'#F9FAFB',borderWidth:1,borderColor:'#E5E5EA',borderRadius:8,paddingHorizontal:12,paddingVertical:10,fontSize:14,marginBottom:8},
  coordRow:{flexDirection:'row',gap:8},
  radioRow:{flexDirection:'row',gap:8,marginBottom:8,flexWrap:'wrap'},
  typeBtn:{flex:1,padding:12,borderRadius:10,backgroundColor:'#F2F2F7',alignItems:'center',gap:4,minWidth:140},
  typeBtnActive:{backgroundColor:'#8E44AD'},
  typeBtnText:{fontSize:13,fontWeight:'700',color:'#1C1C1E'},
  typeBtnDesc:{fontSize:10,color:'#8E8E93'},
  serviceBtn:{paddingHorizontal:14,paddingVertical:8,borderRadius:8,backgroundColor:'#F2F2F7'},
  serviceBtnActive:{backgroundColor:'#8E44AD'},
  serviceBtnText:{fontSize:13,fontWeight:'600',color:'#666'},
  driverList:{marginBottom:8,maxHeight:50},
  driverChip:{paddingHorizontal:14,paddingVertical:8,borderRadius:20,backgroundColor:'#F2F2F7',marginRight:8},
  driverChipActive:{backgroundColor:'#8E44AD'},
  driverChipText:{fontSize:13,fontWeight:'600',color:'#666'},
  infoBox:{flexDirection:'row',gap:10,backgroundColor:'#FFFBEB',borderRadius:10,padding:12,marginTop:12,alignItems:'flex-start'},
  infoBoxText:{flex:1,fontSize:12,color:'#92400E',lineHeight:16},
  modalBtns:{flexDirection:'row',gap:10,marginTop:20},
  btn:{flex:1,paddingVertical:14,borderRadius:10,alignItems:'center'},
  btnCancel:{backgroundColor:'#F2F2F7'},btnSave:{backgroundColor:'#8E44AD'},
  btnCancelText:{color:'#666',fontWeight:'600',fontSize:14},btnSaveText:{color:'#fff',fontWeight:'700',fontSize:14},
});
