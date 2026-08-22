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
}
interface PendingRegistration { user_id: string; name: string; email: string; phone?: string; capabilities?: string[]; }

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

  const decideRegistration = async (item: PendingRegistration, decision: 'approve' | 'reject') => {
    const run = async (reason = '') => {
      setProcessing(true);
      try {
        await apiService.post(`/admin/registrations/${item.user_id}/decision?decision=${decision}&reason=${encodeURIComponent(reason)}`);
        Alert.alert(decision === 'approve' ? 'Registro aprobado' : 'Registro rechazado');
        fetchDrivers();
      } catch (e: any) { Alert.alert('Error', e.message || 'No se pudo revisar'); }
      finally { setProcessing(false); }
    };
    if (decision === 'approve') return run();
    Alert.prompt?.('Rechazar registro', 'Indicá el motivo', text => run(text || ''), 'plain-text');
    if (Platform.OS !== 'ios') run('No cumple los requisitos');
  };

  if (loading) return <SafeAreaView style={st.container}><ActivityIndicator size="large" color="#00C853" style={{ marginTop: 40 }} /></SafeAreaView>;

  return (
    <SafeAreaView style={st.container}>
      <View style={st.header}>
        <Text style={st.title}>Verificación de Documentos</Text>
        <Text style={st.subtitle}>{drivers.length} conductor{drivers.length !== 1 ? 'es' : ''} pendiente{drivers.length !== 1 ? 's' : ''}</Text>
      </View>

      <FlatList
        data={drivers}
        keyExtractor={(item) => item.driver_id}
        renderItem={renderDriver}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDrivers(); }} />}
        ListHeaderComponent={registrations.length ? <View style={{ marginBottom: 18 }}><Text style={{ fontSize: 18, fontWeight: '800', marginBottom: 10 }}>Registros de proveedores</Text>{registrations.map(item => <View key={item.user_id} style={st.docCard}><Text style={st.driverName}>{item.name}</Text><Text style={st.driverEmail}>{item.phone} · {item.email}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 10 }}>{(item.capabilities || []).map(cap => <View key={cap} style={st.pendingBadge}><Text style={st.pendingText}>{cap}</Text></View>)}</View><View style={st.docActions}><TouchableOpacity style={st.rejectBtn} disabled={processing} onPress={() => decideRegistration(item, 'reject')}><Text style={st.rejectBtnText}>Rechazar</Text></TouchableOpacity><TouchableOpacity style={st.approveBtn} disabled={processing} onPress={() => decideRegistration(item, 'approve')}><Text style={st.approveBtnText}>Aprobar capacidades</Text></TouchableOpacity></View></View>)}</View> : null}
        ListEmptyComponent={
          <View style={st.empty}>
            <Ionicons name="checkmark-circle" size={56} color="#00C853" />
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
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#00C853', marginTop: 4 }}>{selectedDriver.plate_number}</Text>
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
                  <TouchableOpacity style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: '#00C853', alignItems: 'center' }} onPress={async () => {
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
                    <Text style={{ fontSize: 14, fontWeight: '800', color: uploadedCount >= 5 ? '#00C853' : '#FF9500' }}>{uploadedCount} / {REQUIRED_DOCS.length}</Text>
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
                    style={{ backgroundColor: '#00C853', paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 20 }}
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
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: { backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  title: { fontSize: 24, fontWeight: '800', color: '#1C1C1E' },
  subtitle: { fontSize: 14, color: '#8E8E93', marginTop: 4 },
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
  dotApproved: { backgroundColor: '#00C853' },
  dotRejected: { backgroundColor: '#FF3B30' },
  dotPending: { backgroundColor: '#FF9500' },
  docLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  statusText: { fontSize: 12, fontWeight: '700' },
  statusApproved: { color: '#00C853' },
  statusRejected: { color: '#FF3B30' },
  statusPending: { color: '#FF9500' },
  docImage: { width: '100%', height: 200, borderRadius: 12, backgroundColor: '#F2F2F7' },
  rejectReasonText: { fontSize: 13, color: '#FF3B30', marginTop: 8, fontStyle: 'italic' },
  docActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  approveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#00C853', borderRadius: 12, paddingVertical: 12 },
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
