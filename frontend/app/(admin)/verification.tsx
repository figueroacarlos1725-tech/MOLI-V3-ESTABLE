import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Image,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/src/services/api';

interface DriverDoc {
  document_id: string;
  doc_type: string;
  status: string;
  file_data?: string;
  file_name?: string;
  uploaded_at?: string;
  reject_reason?: string;
}

interface PendingDriver {
  driver_id: string;
  name: string;
  email: string;
  phone?: string;
  documents: DriverDoc[];
  pending_count: number;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_year?: string | number;
  vehicle_color?: string;
  plate_number?: string;
}
interface PendingRegistration { user_id: string; name: string; email: string; phone?: string; capabilities?: string[]; capability_approvals?: Record<string,{status:string;provisional_until?:string}>; provisional_until?: string; }
const CAP_LABELS: Record<string,string> = { ride_driver:'Conductor',moto_driver:'Conductor de moto',taxi_driver:'Taxi',professional:'Profesional',tramites:'Gestor de trámites',parcel:'Paquetería',delivery:'Delivery',merchant:'Comercio' };

const DOC_LABELS: Record<string, string> = {
  license: 'Licencia de conducir',
  id_front: 'DNI frente',
  id_back: 'DNI dorso',
  vehicle_registration: 'Tarjeta de circulación',
  insurance: 'Seguro del vehículo',
  criminal_record: 'Antecedentes penales',
};

export default function AdminVerificationScreen() {
  const [drivers, setDrivers] = useState<PendingDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<PendingDriver | null>(null);
  const [driverDocs, setDriverDocs] = useState<DriverDoc[]>([]);
  const [previewDoc, setPreviewDoc] = useState<DriverDoc | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [vehicleChanges, setVehicleChanges] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<PendingRegistration[]>([]);

  const fetchDrivers = useCallback(async () => {
    try {
      const res = await apiService.get('/admin/drivers/pending-verification');
      setDrivers(res?.drivers || []);
      // Also fetch vehicle changes
      try {
        const vcRes = await apiService.get('/admin/vehicle-changes');
        setVehicleChanges(vcRes?.changes || []);
      } catch (e) {}
      try {
        const registrationRes = await apiService.get('/admin/registrations?status=pending');
        setRegistrations(registrationRes?.registrations || []);
      } catch (e) {}
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchDrivers(); }, [fetchDrivers]);

  const openDriverDocs = async (driver: PendingDriver) => {
    setSelectedDriver(driver);
    try {
      const res = await apiService.get(`/admin/drivers/${driver.driver_id}/documents`);
      setDriverDocs(res?.documents || []);
    } catch (e) { setDriverDocs([]); }
  };

  const handleReview = async (doc: DriverDoc, action: 'approve' | 'reject') => {
    if (action === 'reject' && !showRejectInput) {
      setPreviewDoc(doc);
      setShowRejectInput(true);
      return;
    }
    setProcessing(true);
    try {
      const reason = action === 'reject' ? rejectReason : '';
      await apiService.post(`/admin/documents/${doc.document_id}/review?action=${action}&reason=${encodeURIComponent(reason)}`);
      // Refresh
      if (selectedDriver) {
        const res = await apiService.get(`/admin/drivers/${selectedDriver.driver_id}/documents`);
        setDriverDocs(res?.documents || []);
      }
      setShowRejectInput(false);
      setRejectReason('');
      fetchDrivers();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo procesar');
    }
    setProcessing(false);
  };

  const renderDriver = ({ item }: { item: PendingDriver }) => (
    <TouchableOpacity style={st.driverCard} onPress={() => openDriverDocs(item)}>
      <View style={st.driverIcon}>
        <Ionicons name="car" size={22} color="#fff" />
      </View>
      <View style={st.driverInfo}>
        <Text style={st.driverName}>{item.name || item.email}</Text>
        <Text style={st.driverEmail}>{item.email}</Text>
      </View>
      {(item as any).has_no_docs ? (
        <View style={[st.pendingBadge, { backgroundColor: '#FFEBEE' }]}>
          <Text style={[st.pendingText, { color: '#FF3B30' }]}>Sin documentos</Text>
        </View>
      ) : (
        <View style={st.pendingBadge}>
          <Text style={st.pendingText}>{item.pending_count} pendiente{item.pending_count > 1 ? 's' : ''}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
    </TouchableOpacity>
  );

  const decideRegistration = async (item: PendingRegistration, capability: string, decision: 'approve' | 'reject') => {
    const run = async (reason = '') => {
      setProcessing(true);
      try {
        await apiService.post(`/admin/registrations/${item.user_id}/decision?decision=${decision}&capability=${encodeURIComponent(capability)}&reason=${encodeURIComponent(reason)}`);
        Alert.alert(decision === 'approve' ? 'Capacidad aprobada' : 'Capacidad rechazada', CAP_LABELS[capability] || capability);
        fetchDrivers();
      } catch (e: any) { Alert.alert('Error', e.message || 'No se pudo revisar'); }
      finally { setProcessing(false); }
    };
    if (decision === 'approve') return run();
    Alert.prompt?.('Rechazar registro', 'Indicá el motivo', text => run(text || ''), 'plain-text');
    if (Platform.OS !== 'ios') run('No cumple los requisitos');
  };

  if (loading) return <SafeAreaView style={st.container}><ActivityIndicator size="large" color="#FF7733" style={{ marginTop: 40 }} /></SafeAreaView>;

  return (
    <SafeAreaView style={st.container}>
      <View style={st.header}>
        <View><Text style={st.eyebrow}>MOLI ADMIN</Text><Text style={st.title}>Centro de aprobaciones</Text><Text style={st.subtitle}>Revisá documentación y habilitá cada capacidad por separado</Text></View>
        <View style={st.kpis}><View style={[st.kpi,{backgroundColor:'#FFF1E9'}]}><Ionicons name="time" size={21} color="#FF5A1F"/><Text style={st.kpiNumber}>{registrations.length + drivers.length}</Text><Text style={st.kpiLabel}>Pendientes</Text></View><View style={[st.kpi,{backgroundColor:'#FFF8E8'}]}><Ionicons name="flash" size={21} color="#E69A18"/><Text style={st.kpiNumber}>{registrations.length}</Text><Text style={st.kpiLabel}>Provisorios 24h</Text></View><View style={[st.kpi,{backgroundColor:'#ECF9F0'}]}><Ionicons name="shield-checkmark" size={21} color="#22A559"/><Text style={st.kpiNumber}>{drivers.filter(d=>d.pending_count===0).length}</Text><Text style={st.kpiLabel}>Listos</Text></View></View>
      </View>

      <FlatList
        data={drivers}
        keyExtractor={(item) => item.driver_id}
        renderItem={renderDriver}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDrivers(); }} />}
        ListHeaderComponent={registrations.length ? <View style={{ marginBottom: 18 }}><View style={st.sectionHead}><Text style={st.sectionTitle}>Registros de proveedores</Text><View style={st.livePill}><View style={st.liveDot}/><Text style={st.liveText}>Acceso provisorio</Text></View></View>{registrations.map(item => <View key={item.user_id} style={st.registrationCard}><View style={st.personRow}><View style={st.avatar}><Text style={st.avatarText}>{item.name?.slice(0,1).toUpperCase()}</Text></View><View style={{flex:1}}><Text style={st.driverName}>{item.name}</Text><Text style={st.driverEmail}>{item.phone} · {item.email}</Text></View><View style={st.hoursBadge}><Ionicons name="timer-outline" size={14} color="#B85A1B"/><Text style={st.hoursText}>hasta 24 h</Text></View></View><Text style={st.capTitle}>CAPACIDADES SOLICITADAS</Text>{(item.capabilities || []).map(cap => { const state=item.capability_approvals?.[cap]?.status || 'provisional'; return <View key={cap} style={st.capRow}><View style={st.capIcon}><Ionicons name={cap==='merchant'?'storefront':cap==='professional'?'construct':cap==='tramites'?'document-text':'car'} size={21} color="#FF5A1F"/></View><View style={{flex:1}}><Text style={st.capName}>{CAP_LABELS[cap] || cap}</Text><Text style={st.capStatus}>{state==='provisional'?'Trabajando provisoriamente · revisión pendiente':state==='approved'?'Aprobada':state==='rejected'?'Rechazada':'Pendiente'}</Text></View>{state!=='approved'&&state!=='rejected'?<View style={st.inlineActions}><TouchableOpacity style={st.smallReject} disabled={processing} onPress={() => decideRegistration(item, cap, 'reject')}><Ionicons name="close" size={18} color="#D43C32"/></TouchableOpacity><TouchableOpacity style={st.smallApprove} disabled={processing} onPress={() => decideRegistration(item, cap, 'approve')}><Ionicons name="checkmark" size={19} color="#FFF"/></TouchableOpacity></View>:null}</View>})}</View>)}</View> : null}
        ListEmptyComponent={
          <View style={st.empty}>
            <Ionicons name="checkmark-circle" size={56} color="#FF7733" />
            <Text style={st.emptyTitle}>¡Todo al día!</Text>
            <Text style={st.emptyText}>No hay documentos pendientes de verificación</Text>
          </View>
        }
      />

      {/* Driver Documents Modal */}
      <Modal visible={!!selectedDriver} animationType="slide" onRequestClose={() => { setSelectedDriver(null); setDriverDocs([]); }}>
        <SafeAreaView style={st.modalContainer}>
          <View style={st.modalHeader}>
            <TouchableOpacity onPress={() => { setSelectedDriver(null); setDriverDocs([]); }} style={st.backBtn}>
              <Ionicons name="chevron-back" size={24} color="#1C1C1E" />
            </TouchableOpacity>
            <Text style={st.modalTitle}>{selectedDriver?.name || 'Conductor'}</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {/* Vehicle Info */}
            {selectedDriver && (
              <View style={{ backgroundColor: '#F2F2F7', borderRadius: 16, padding: 16, marginBottom: 16 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#1C1C1E', marginBottom: 8 }}>Datos del vehículo</Text>
                <Text style={{ fontSize: 13, color: '#3C3C43' }}>
                  {selectedDriver.vehicle_make ? `${selectedDriver.vehicle_color || ''} ${selectedDriver.vehicle_make} ${selectedDriver.vehicle_model} ${selectedDriver.vehicle_year || ''}`.trim() : 'Sin vehículo registrado'}
                </Text>
                {selectedDriver.plate_number ? (
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#FF7733', marginTop: 4 }}>{selectedDriver.plate_number}</Text>
                ) : null}
              </View>
            )}

            {/* Pending Vehicle Changes */}
            {vehicleChanges.filter(vc => vc.driver_id === selectedDriver?.driver_id).map(vc => (
              <View key={vc.change_id} style={{ backgroundColor: '#FFF8E1', borderRadius: 16, padding: 16, marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FF9500', marginBottom: 8 }}>Cambio de vehículo pendiente</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: '#8E8E93', marginBottom: 2 }}>Actual</Text>
                    <Text style={{ fontSize: 12, color: '#1C1C1E' }}>{vc.current.vehicle_make} {vc.current.vehicle_model}</Text>
                    <Text style={{ fontSize: 12, color: '#1C1C1E' }}>{vc.current.vehicle_color} · {vc.current.plate_number}</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={16} color="#8E8E93" style={{ alignSelf: 'center' }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: '#FF9500', marginBottom: 2 }}>Nuevo</Text>
                    <Text style={{ fontSize: 12, color: '#1C1C1E', fontWeight: '600' }}>{vc.requested.vehicle_make} {vc.requested.vehicle_model}</Text>
                    <Text style={{ fontSize: 12, color: '#1C1C1E', fontWeight: '600' }}>{vc.requested.vehicle_color} · {vc.requested.plate_number}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <TouchableOpacity style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: '#FF3B30', alignItems: 'center' }} onPress={async () => {
                    try { await apiService.put(`/admin/vehicle-changes/${vc.change_id}`, { action: 'reject' }); Alert.alert('Rechazado'); fetchDrivers(); setSelectedDriver(null); } catch(e) {}
                  }}>
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Rechazar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: '#FF7733', alignItems: 'center' }} onPress={async () => {
                    try { await apiService.put(`/admin/vehicle-changes/${vc.change_id}`, { action: 'approve' }); Alert.alert('Aprobado', 'Datos de vehículo actualizados'); fetchDrivers(); setSelectedDriver(null); } catch(e) {}
                  }}>
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Aprobar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {/* Show ALL required docs, mark as uploaded or not */}
            {(() => {
              const REQUIRED_DOCS = [
                { key: 'license', label: 'Licencia de conducir' },
                { key: 'id_front', label: 'DNI Frente' },
                { key: 'id_back', label: 'DNI Dorso' },
                { key: 'vehicle_registration', label: 'Tarjeta de circulación' },
                { key: 'insurance', label: 'Seguro del vehículo' },
                { key: 'criminal_record', label: 'Antecedentes penales' },
              ];
              const uploadedCount = driverDocs.length;
              return (
                <>
                  <View style={{ backgroundColor: '#F8F8FA', borderRadius: 14, padding: 14, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#1C1C1E' }}>Documentos subidos</Text>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: uploadedCount >= 5 ? '#FF7733' : '#FF9500' }}>{uploadedCount} / {REQUIRED_DOCS.length}</Text>
                  </View>
                  {REQUIRED_DOCS.map(req => {
                    const doc = driverDocs.find(d => d.doc_type === req.key);
                    if (doc) {
                      const isApproved = doc.status === 'approved';
                      const isRejected = doc.status === 'rejected';
                      const isPending = doc.status === 'pending';
                      return (
                        <View key={req.key} style={st.docCard}>
                          <View style={st.docHeader}>
                            <View style={[st.statusDot, isApproved ? st.dotApproved : isRejected ? st.dotRejected : st.dotPending]} />
                            <Text style={st.docLabel}>{req.label}</Text>
                            <Text style={[st.statusText, isApproved ? st.statusApproved : isRejected ? st.statusRejected : st.statusPending]}>
                              {isApproved ? 'Aprobado' : isRejected ? 'Rechazado' : 'Pendiente'}
                            </Text>
                          </View>
                          {doc.file_data && (
                            <TouchableOpacity onPress={() => setPreviewDoc(doc)}>
                              <Image source={{ uri: doc.file_data }} style={st.docImage} resizeMode="cover" />
                            </TouchableOpacity>
                          )}
                          {isRejected && doc.reject_reason ? (
                            <Text style={st.rejectReasonText}>Motivo: {doc.reject_reason}</Text>
                          ) : null}
                          {isPending && (
                            <View style={st.docActions}>
                              <TouchableOpacity style={st.approveBtn} onPress={() => handleReview(doc, 'approve')} disabled={processing}>
                                {processing ? <ActivityIndicator color="#fff" size="small" /> : (
                                  <><Ionicons name="checkmark" size={18} color="#fff" /><Text style={st.approveBtnText}>Aprobar</Text></>
                                )}
                              </TouchableOpacity>
                              <TouchableOpacity style={st.rejectBtn} onPress={() => handleReview(doc, 'reject')} disabled={processing}>
                                <Ionicons name="close" size={18} color="#FF3B30" /><Text style={st.rejectBtnText}>Rechazar</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    } else {
                      return (
                        <View key={req.key} style={[st.docCard, { opacity: 0.6 }]}>
                          <View style={st.docHeader}>
                            <View style={[st.statusDot, { backgroundColor: '#D1D1D6' }]} />
                            <Text style={st.docLabel}>{req.label}</Text>
                            <Text style={[st.statusText, { color: '#C7C7CC' }]}>No subido</Text>
                          </View>
                        </View>
                      );
                    }
                  })}

                  {/* VERIFY / REJECT DRIVER BUTTONS */}
                  <TouchableOpacity
                    style={{ backgroundColor: '#FF7733', paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 20 }}
                    onPress={async () => {
                      try {
                        setProcessing(true);
                        await apiService.put(`/admin/drivers/${selectedDriver!.driver_id}/verify?verified=true`);
                        Alert.alert('Conductor verificado', `${selectedDriver!.name} fue verificado exitosamente`);
                        setSelectedDriver(null);
                        setDriverDocs([]);
                        fetchDrivers();
                      } catch (e: any) { Alert.alert('Error', e.message); }
                      finally { setProcessing(false); }
                    }}
                    disabled={processing}
                  >
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
                      {processing ? 'Procesando...' : '✅ Verificar conductor'}
                    </Text>
                  </TouchableOpacity>

                  {!showRejectInput ? (
                    <TouchableOpacity
                      style={{ backgroundColor: '#FFEBEE', paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 10 }}
                      onPress={() => setShowRejectInput(true)}
                    >
                      <Text style={{ color: '#FF3B30', fontSize: 15, fontWeight: '700' }}>❌ Rechazar conductor</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ marginTop: 10, backgroundColor: '#FFF5F5', borderRadius: 14, padding: 14 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#FF3B30', marginBottom: 8 }}>Motivo del rechazo:</Text>
                      <TextInput
                        style={{ backgroundColor: '#fff', borderRadius: 10, padding: 12, fontSize: 14, color: '#1C1C1E', borderWidth: 1, borderColor: '#FFD1D1', minHeight: 60 }}
                        placeholder="Ej: DNI ilegible, seguro vencido..."
                        placeholderTextColor="#C7C7CC"
                        value={rejectReason}
                        onChangeText={setRejectReason}
                        multiline
                      />
                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                        <TouchableOpacity
                          style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#F2F2F7', alignItems: 'center' }}
                          onPress={() => { setShowRejectInput(false); setRejectReason(''); }}
                        >
                          <Text style={{ color: '#636366', fontWeight: '600' }}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#FF3B30', alignItems: 'center' }}
                          onPress={async () => {
                            if (!rejectReason.trim()) { Alert.alert('Error', 'Ingresá un motivo'); return; }
                            setProcessing(true);
                            try {
                              await apiService.put(`/admin/drivers/${selectedDriver!.driver_id}/verify?verified=false`);
                              // Send rejection message to inbox
                              await apiService.post('/inbox/send', {
                                recipient_id: selectedDriver!.driver_id,
                                subject: 'Verificación rechazada',
                                body: `Tu verificación fue rechazada. Motivo: ${rejectReason.trim()}. Por favor corregí los documentos y volvé a subirlos.`,
                              });
                              Alert.alert('Conductor rechazado', 'Se envió el motivo a su bandeja de entrada');
                              setSelectedDriver(null);
                              setDriverDocs([]);
                              setShowRejectInput(false);
                              setRejectReason('');
                              fetchDrivers();
                            } catch (e: any) { Alert.alert('Error', e.message); }
                            finally { setProcessing(false); }
                          }}
                          disabled={processing}
                        >
                          <Text style={{ color: '#fff', fontWeight: '700' }}>Rechazar</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  <TouchableOpacity
                    style={{ paddingVertical: 14, alignItems: 'center', marginTop: 8 }}
                    onPress={() => { setSelectedDriver(null); setDriverDocs([]); setShowRejectInput(false); setRejectReason(''); }}
                  >
                    <Text style={{ color: '#636366', fontSize: 14 }}>Cerrar</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Reject Reason Input */}
      <Modal visible={showRejectInput} transparent animationType="fade">
        <View style={st.rejectOverlay}>
          <View style={st.rejectCard}>
            <Text style={st.rejectTitle}>Motivo del rechazo</Text>
            <TextInput
              style={st.rejectInput}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Ej: Imagen borrosa, documento vencido..."
              placeholderTextColor="#C7C7CC"
              multiline
            />
            <View style={st.rejectActions}>
              <TouchableOpacity style={st.rejectCancelBtn} onPress={() => { setShowRejectInput(false); setRejectReason(''); }}>
                <Text style={st.rejectCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.rejectConfirmBtn} onPress={() => previewDoc && handleReview(previewDoc, 'reject')} disabled={!rejectReason.trim()}>
                <Text style={st.rejectConfirmText}>Rechazar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Image Preview */}
      {previewDoc && !showRejectInput && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setPreviewDoc(null)}>
          <View style={st.previewOverlay}>
            <TouchableOpacity style={st.previewClose} onPress={() => setPreviewDoc(null)}>
              <Ionicons name="close-circle" size={36} color="#fff" />
            </TouchableOpacity>
            {previewDoc.file_data && (
              <Image source={{ uri: previewDoc.file_data }} style={st.previewImage} resizeMode="contain" />
            )}
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F3' },
  header: { backgroundColor: '#202124', paddingHorizontal: 22, paddingTop: 20, paddingBottom: 22, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:2,color:'#FF8A55',marginBottom:4},
  title: { fontSize: 27, fontWeight: '900', color: '#FFF' },
  subtitle: { fontSize: 14, color: '#8E8E93', marginTop: 4 },
  kpis:{flexDirection:'row',gap:9,marginTop:18},kpi:{flex:1,minHeight:80,borderRadius:17,padding:11,justifyContent:'center'},kpiNumber:{fontSize:20,fontWeight:'900',color:'#202124',marginTop:3},kpiLabel:{fontSize:10,fontWeight:'700',color:'#726A66'},
  sectionHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:11},sectionTitle:{fontSize:19,fontWeight:'900',color:'#202124'},livePill:{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'#ECF9F0',borderRadius:14,paddingHorizontal:10,paddingVertical:6},liveDot:{width:8,height:8,borderRadius:4,backgroundColor:'#22A559'},liveText:{fontSize:10,fontWeight:'800',color:'#20834A'},
  registrationCard:{backgroundColor:'#FFF',borderRadius:22,padding:16,marginBottom:13,borderWidth:1,borderColor:'#F1E2D8',shadowColor:'#713211',shadowOpacity:.09,shadowRadius:12,elevation:3},personRow:{flexDirection:'row',alignItems:'center',gap:11,marginBottom:15},avatar:{width:48,height:48,borderRadius:17,backgroundColor:'#202124',alignItems:'center',justifyContent:'center'},avatarText:{fontSize:20,fontWeight:'900',color:'#FFF'},hoursBadge:{flexDirection:'row',alignItems:'center',gap:4,backgroundColor:'#FFF1E9',borderRadius:12,paddingHorizontal:9,paddingVertical:6},hoursText:{fontSize:10,fontWeight:'800',color:'#B85A1B'},capTitle:{fontSize:9,fontWeight:'900',letterSpacing:1.3,color:'#9B8E86',marginBottom:7},capRow:{flexDirection:'row',alignItems:'center',gap:10,minHeight:62,borderTopWidth:1,borderTopColor:'#F4ECE7'},capIcon:{width:38,height:38,borderRadius:13,backgroundColor:'#FFF0E7',alignItems:'center',justifyContent:'center'},capName:{fontSize:14,fontWeight:'800',color:'#25211F'},capStatus:{fontSize:11,color:'#A3613F',marginTop:2},inlineActions:{flexDirection:'row',gap:7},smallReject:{width:36,height:36,borderRadius:12,backgroundColor:'#FFF0EF',alignItems:'center',justifyContent:'center'},smallApprove:{width:36,height:36,borderRadius:12,backgroundColor:'#FF5A1F',alignItems:'center',justifyContent:'center'},
  driverCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, gap: 12 },
  driverIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center' },
  driverInfo: { flex: 1 },
  driverName: { fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  driverEmail: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  pendingBadge: { backgroundColor: '#FFF3E0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  pendingText: { fontSize: 12, fontWeight: '700', color: '#FF9500' },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1C1C1E', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#8E8E93', marginTop: 4 },
  // Modal
  modalContainer: { flex: 1, backgroundColor: '#F2F2F7' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  modalTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#1C1C1E', textAlign: 'center' },
  docCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12 },
  docHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  dotApproved: { backgroundColor: '#FF7733' },
  dotRejected: { backgroundColor: '#FF3B30' },
  dotPending: { backgroundColor: '#FF9500' },
  docLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  statusText: { fontSize: 12, fontWeight: '700' },
  statusApproved: { color: '#FF7733' },
  statusRejected: { color: '#FF3B30' },
  statusPending: { color: '#FF9500' },
  docImage: { width: '100%', height: 200, borderRadius: 12, backgroundColor: '#F2F2F7' },
  rejectReasonText: { fontSize: 13, color: '#FF3B30', marginTop: 8, fontStyle: 'italic' },
  docActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  approveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FF7733', borderRadius: 12, paddingVertical: 12 },
  approveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FFF5F5', borderRadius: 12, paddingVertical: 12, borderWidth: 1, borderColor: '#FFE0E0' },
  rejectBtnText: { color: '#FF3B30', fontSize: 15, fontWeight: '700' },
  // Reject modal
  rejectOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  rejectCard: { width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: 24 },
  rejectTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginBottom: 12 },
  rejectInput: { backgroundColor: '#F2F2F7', borderRadius: 12, padding: 14, fontSize: 15, minHeight: 80, textAlignVertical: 'top', color: '#1C1C1E' },
  rejectActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  rejectCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#F2F2F7', alignItems: 'center' },
  rejectCancelText: { fontSize: 15, fontWeight: '600', color: '#8E8E93' },
  rejectConfirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#FF3B30', alignItems: 'center' },
  rejectConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  // Preview
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  previewClose: { position: 'absolute', top: 50, right: 20, zIndex: 10 },
  previewImage: { width: '90%', height: '70%' },
});
