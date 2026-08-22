import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/src/services/api';
import { MapView } from '@/src/components/MapView';

interface LiveDriver {
  driver_id: string; name: string; phone: string;
  is_online: boolean; is_available: boolean; is_blocked: boolean;
  service_types: string[]; priority: number;
  latitude: number | null; longitude: number | null;
  active_ride: any;
}

export default function GodsEyeScreen() {
  const [drivers, setDrivers] = useState<LiveDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all'|'online'|'busy'|'offline'>('all');
  const [selectedDriver, setSelectedDriver] = useState<LiveDriver|null>(null);
  const refreshTimer = useRef<any>(null);

  useEffect(() => {
    fetchDrivers();
    // Auto refresh every 15 seconds
    refreshTimer.current = setInterval(fetchDrivers, 15000);
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, []);

  const fetchDrivers = async () => {
    try {
      const r = await apiService.get('/admin/drivers/live');
      setDrivers(r.drivers || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const filtered = drivers.filter(d => {
    if (filter === 'online') return d.is_online && !d.active_ride;
    if (filter === 'busy') return d.is_online && d.active_ride;
    if (filter === 'offline') return !d.is_online;
    return true;
  });

  const mapMarkers = filtered
    .filter(d => d.latitude && d.longitude)
    .map(d => ({
      latitude: d.latitude!,
      longitude: d.longitude!,
      title: d.name,
      type: 'driver' as const,
      vehicleType: d.service_types?.[0] || 'economy',
    }));

  const onlineCount = drivers.filter(d => d.is_online).length;
  const busyCount = drivers.filter(d => d.active_ride).length;
  const offlineCount = drivers.filter(d => !d.is_online).length;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <Ionicons name="eye" size={26} color="#E8492E" />
          <Text style={s.title}>Ojo de Dios</Text>
          <TouchableOpacity onPress={fetchDrivers} style={s.refreshBtn}>
            <Ionicons name="refresh" size={20} color="#E8492E" />
          </TouchableOpacity>
        </View>
        <View style={s.statsRow}>
          <View style={s.statChip}>
            <View style={[s.dot, {backgroundColor:'#10B981'}]} />
            <Text style={s.statText}>{onlineCount} en linea</Text>
          </View>
          <View style={s.statChip}>
            <View style={[s.dot, {backgroundColor:'#F59E0B'}]} />
            <Text style={s.statText}>{busyCount} en viaje</Text>
          </View>
          <View style={s.statChip}>
            <View style={[s.dot, {backgroundColor:'#EF4444'}]} />
            <Text style={s.statText}>{offlineCount} offline</Text>
          </View>
        </View>
      </View>

      {/* Map */}
      <View style={s.mapContainer}>
        <MapView
          initialRegion={{ latitude: -28.4696, longitude: -65.7852 }}
          markers={mapMarkers}
          style={{ flex: 1 }}
        />
        <Text style={s.autoRefresh}>Auto-actualiza cada 15s</Text>
      </View>

      {/* Filters */}
      <View style={s.filterRow}>
        {(['all','online','busy','offline'] as const).map(f => (
          <TouchableOpacity key={f} style={[s.filterBtn, filter===f && s.filterBtnActive]} onPress={() => setFilter(f)}>
            <Text style={[s.filterBtnText, filter===f && s.filterBtnTextActive]}>
              {f==='all'?'Todos':f==='online'?'Libres':f==='busy'?'En viaje':'Offline'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Driver List */}
      {loading ? <ActivityIndicator size="large" color="#E8492E" style={{marginTop:20}} /> :
        <ScrollView contentContainerStyle={s.list}>
          {filtered.map(d => (
            <TouchableOpacity key={d.driver_id} style={s.driverCard} onPress={() => setSelectedDriver(selectedDriver?.driver_id === d.driver_id ? null : d)}>
              <View style={s.driverRow}>
                <View style={[s.statusDot, d.is_online ? (d.active_ride ? s.dotBusy : s.dotOnline) : s.dotOffline]} />
                <View style={{flex:1}}>
                  <Text style={s.driverName}>{d.name}</Text>
                  <Text style={s.driverPhone}>{d.phone || 'Sin telefono'}</Text>
                </View>
                <View style={{alignItems:'flex-end'}}>
                  {d.active_ride && <Text style={s.rideBadge}>En viaje</Text>}
                  {d.is_blocked && <Text style={s.blockedBadge}>Bloqueado</Text>}
                  {d.priority > 0 && <Text style={s.priorityBadge}>P{d.priority}</Text>}
                </View>
              </View>
              {selectedDriver?.driver_id === d.driver_id && (
                <View style={s.driverDetail}>
                  <Text style={s.detailText}>Servicios: {d.service_types?.join(', ') || 'economy'}</Text>
                  {d.latitude && <Text style={s.detailText}>Ubicacion: {d.latitude.toFixed(4)}, {d.longitude?.toFixed(4)}</Text>}
                  {d.active_ride && <Text style={s.detailText}>Viaje: {d.active_ride.ride_id} ({d.active_ride.status})</Text>}
                  {!d.latitude && <Text style={s.detailText}>Sin ubicacion GPS</Text>}
                </View>
              )}
            </TouchableOpacity>
          ))}
          {filtered.length === 0 && <Text style={s.empty}>No hay conductores en esta categoria</Text>}
          <View style={{height:30}} />
        </ScrollView>
      }
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:'#F2F2F7'},
  header:{backgroundColor:'#fff',paddingHorizontal:16,paddingTop:12,paddingBottom:10,borderBottomWidth:1,borderBottomColor:'#E5E5EA'},
  headerRow:{flexDirection:'row',alignItems:'center',gap:10},
  title:{fontSize:22,fontWeight:'bold',color:'#1C1C1E',flex:1},
  refreshBtn:{padding:8,backgroundColor:'#FFF0EC',borderRadius:8},
  statsRow:{flexDirection:'row',gap:12,marginTop:8},
  statChip:{flexDirection:'row',alignItems:'center',gap:6},
  dot:{width:8,height:8,borderRadius:4},
  statText:{fontSize:12,color:'#666',fontWeight:'600'},
  mapContainer:{height:280,margin:12,borderRadius:14,overflow:'hidden',position:'relative'},
  autoRefresh:{position:'absolute',bottom:8,right:8,backgroundColor:'rgba(0,0,0,0.5)',color:'#fff',fontSize:10,paddingHorizontal:8,paddingVertical:3,borderRadius:10,overflow:'hidden'},
  filterRow:{flexDirection:'row',paddingHorizontal:12,gap:8,marginBottom:8},
  filterBtn:{paddingHorizontal:14,paddingVertical:6,borderRadius:20,backgroundColor:'#E5E5EA'},
  filterBtnActive:{backgroundColor:'#E8492E'},
  filterBtnText:{fontSize:13,fontWeight:'600',color:'#666'},
  filterBtnTextActive:{color:'#fff'},
  list:{paddingHorizontal:12,gap:8},
  driverCard:{backgroundColor:'#fff',borderRadius:12,padding:12},
  driverRow:{flexDirection:'row',alignItems:'center',gap:10},
  statusDot:{width:12,height:12,borderRadius:6},
  dotOnline:{backgroundColor:'#10B981'},dotBusy:{backgroundColor:'#F59E0B'},dotOffline:{backgroundColor:'#D1D5DB'},
  driverName:{fontSize:15,fontWeight:'600',color:'#1C1C1E'},
  driverPhone:{fontSize:12,color:'#8E8E93'},
  rideBadge:{fontSize:10,fontWeight:'700',color:'#F59E0B',backgroundColor:'#FEF3C7',paddingHorizontal:8,paddingVertical:2,borderRadius:8,overflow:'hidden'},
  blockedBadge:{fontSize:10,fontWeight:'700',color:'#EF4444',backgroundColor:'#FEE2E2',paddingHorizontal:8,paddingVertical:2,borderRadius:8,overflow:'hidden',marginTop:2},
  priorityBadge:{fontSize:10,fontWeight:'700',color:'#8B5CF6',backgroundColor:'#FFF0EC',paddingHorizontal:8,paddingVertical:2,borderRadius:8,overflow:'hidden',marginTop:2},
  driverDetail:{marginTop:10,paddingTop:10,borderTopWidth:1,borderTopColor:'#F2F2F7'},
  detailText:{fontSize:12,color:'#666',marginBottom:2},
  empty:{textAlign:'center',color:'#8E8E93',marginTop:30,fontSize:15},
});
