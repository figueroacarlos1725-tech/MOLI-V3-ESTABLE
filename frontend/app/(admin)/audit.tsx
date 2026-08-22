import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/src/services/api';

const ACTION_LABELS: Record<string,{label:string,icon:string,color:string}> = {
  user_create:{label:'Usuario creado',icon:'person-add',color:'#10B981'},
  user_update:{label:'Usuario editado',icon:'pencil',color:'#3B82F6'},
  balance_update:{label:'Saldo modificado',icon:'cash',color:'#F59E0B'},
  debt_update:{label:'Deuda modificada',icon:'trending-down',color:'#EF4444'},
  fare_update:{label:'Tarifa actualizada',icon:'pricetag',color:'#8B5CF6'},
  coupon_create:{label:'Cupón creado',icon:'gift',color:'#10B981'},
  commission_update:{label:'Comisión cambiada',icon:'calculator',color:'#F59E0B'},
  driver_block:{label:'Conductor bloqueado',icon:'ban',color:'#EF4444'},
  driver_unblock:{label:'Conductor desbloqueado',icon:'checkmark-circle',color:'#10B981'},
  priority_update:{label:'Prioridad cambiada',icon:'arrow-up',color:'#8B5CF6'},
  payment_config_update:{label:'Config. pagos actualizada',icon:'card',color:'#3B82F6'},
};

export default function AdminAuditScreen() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => { fetchLogs(); }, [page]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const r = await apiService.get(`/admin/audit-log?page=${page}&limit=25`);
      setLogs(r.logs || []);
      setTotalPages(r.pages || 1);
    } catch (e) {} finally { setLoading(false); }
  };

  const LogItem = ({log}: {log:any}) => {
    const info = ACTION_LABELS[log.action] || {label:log.action,icon:'ellipse',color:'#8E8E93'};
    return (
      <View style={s.logItem}>
        <View style={[s.logIcon, {backgroundColor:info.color+'20'}]}>
          <Ionicons name={info.icon as any} size={18} color={info.color} />
        </View>
        <View style={{flex:1}}>
          <Text style={s.logAction}>{info.label}</Text>
          <Text style={s.logTarget}>{log.target_name}</Text>
          {log.reason ? <Text style={s.logReason}>{log.reason}</Text> : null}
          <Text style={s.logChanges}>{JSON.stringify(log.changes||{}).substring(0,120)}</Text>
        </View>
        <View style={{alignItems:'flex-end'}}>
          <Text style={s.logAdmin}>{log.admin_name}</Text>
          <Text style={s.logDate}>{log.created_at?.substring(0,16).replace('T',' ')}</Text>
          <View style={[s.sourceBadge, log.source==='admin'?s.sourceBadgeAdmin:s.sourceBadgeSystem]}>
            <Text style={s.sourceBadgeText}>{log.source}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Historial de Cambios</Text>
        <TouchableOpacity onPress={fetchLogs}>
          <Ionicons name="refresh" size={22} color="#E8492E" />
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator size="large" color="#E8492E" style={{marginTop:40}} /> :
        <ScrollView contentContainerStyle={s.list}>
          {logs.length === 0 && <Text style={s.empty}>No hay registros</Text>}
          {logs.map((log, i) => <LogItem key={i} log={log} />)}

          <View style={s.pagination}>
            <TouchableOpacity style={[s.pageBtn, page<=1&&s.pageBtnDisabled]} onPress={() => setPage(p => Math.max(1,p-1))} disabled={page<=1}>
              <Text style={s.pageBtnText}>Anterior</Text>
            </TouchableOpacity>
            <Text style={s.pageInfo}>Pág {page}/{totalPages}</Text>
            <TouchableOpacity style={[s.pageBtn, page>=totalPages&&s.pageBtnDisabled]} onPress={() => setPage(p => p+1)} disabled={page>=totalPages}>
              <Text style={s.pageBtnText}>Siguiente</Text>
            </TouchableOpacity>
          </View>
          <View style={{height:40}} />
        </ScrollView>
      }
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:'#F2F2F7'},
  header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:16,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#E5E5EA'},
  title:{fontSize:24,fontWeight:'bold',color:'#1C1C1E'},
  list:{padding:12,gap:8},
  empty:{textAlign:'center',color:'#8E8E93',marginTop:40,fontSize:16},
  logItem:{flexDirection:'row',backgroundColor:'#fff',borderRadius:12,padding:12,gap:10,alignItems:'flex-start'},
  logIcon:{width:36,height:36,borderRadius:10,justifyContent:'center',alignItems:'center'},
  logAction:{fontSize:14,fontWeight:'700',color:'#1C1C1E'},
  logTarget:{fontSize:13,color:'#E8492E',fontWeight:'600'},
  logReason:{fontSize:12,color:'#F59E0B',fontStyle:'italic'},
  logChanges:{fontSize:11,color:'#8E8E93',marginTop:2},
  logAdmin:{fontSize:11,color:'#8E8E93',fontWeight:'600'},
  logDate:{fontSize:10,color:'#C7C7CC'},
  sourceBadge:{paddingHorizontal:6,paddingVertical:2,borderRadius:4,marginTop:4},
  sourceBadgeAdmin:{backgroundColor:'#FFF0EC'},sourceBadgeSystem:{backgroundColor:'#FFF0EC'},
  sourceBadgeText:{fontSize:9,fontWeight:'700',color:'#666'},
  pagination:{flexDirection:'row',justifyContent:'center',alignItems:'center',gap:16,marginTop:16},
  pageBtn:{paddingHorizontal:16,paddingVertical:8,borderRadius:8,backgroundColor:'#E8492E'},
  pageBtnDisabled:{backgroundColor:'#D1D5DB'},
  pageBtnText:{color:'#fff',fontWeight:'600',fontSize:13},
  pageInfo:{fontSize:13,color:'#666',fontWeight:'600'},
});
