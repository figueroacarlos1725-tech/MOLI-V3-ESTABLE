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

  const fetchDrivers = useCallback(async () => {
    try {
      const res = await apiService.get('/admin/drivers/pending-verification');
      setDrivers(res?.drivers || []);
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
      <View style={st.pendingBadge}>
        <Text style={st.pendingText}>{item.pending_count} pendiente{item.pending_count > 1 ? 's' : ''}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
    </TouchableOpacity>
  );

  if (loading) return <SafeAreaView style={st.container}><ActivityIndicator size="large" color="#A855F7" style={{ marginTop: 40 }} /></SafeAreaView>;

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
        ListEmptyComponent={
          <View style={st.empty}>
            <Ionicons name="checkmark-circle" size={56} color="#A855F7" />
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
            {driverDocs.map((doc) => {
              const label = DOC_LABELS[doc.doc_type] || doc.doc_type;
              const isApproved = doc.status === 'approved';
              const isRejected = doc.status === 'rejected';
              const isPending = doc.status === 'pending';

              return (
                <View key={doc.doc_type} style={st.docCard}>
                  <View style={st.docHeader}>
                    <View style={[st.statusDot, isApproved ? st.dotApproved : isRejected ? st.dotRejected : st.dotPending]} />
                    <Text style={st.docLabel}>{label}</Text>
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
            })}
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
  dotApproved: { backgroundColor: '#A855F7' },
  dotRejected: { backgroundColor: '#FF3B30' },
  dotPending: { backgroundColor: '#FF9500' },
  docLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  statusText: { fontSize: 12, fontWeight: '700' },
  statusApproved: { color: '#A855F7' },
  statusRejected: { color: '#FF3B30' },
  statusPending: { color: '#FF9500' },
  docImage: { width: '100%', height: 200, borderRadius: 12, backgroundColor: '#F2F2F7' },
  rejectReasonText: { fontSize: 13, color: '#FF3B30', marginTop: 8, fontStyle: 'italic' },
  docActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  approveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#A855F7', borderRadius: 12, paddingVertical: 12 },
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
