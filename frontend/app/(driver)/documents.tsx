import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { apiService } from '@/src/services/api';

const GREEN = '#00C853';

export default function DocumentsScreen() {
  const router = useRouter();
  const [documents, setDocuments] = useState<any[]>([]);
  const [verificationStatus, setVerificationStatus] = useState('incomplete');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => { fetchDocs(); }, []);

  const fetchDocs = async () => {
    try {
      const res = await apiService.get('/driver/documents/required');
      setDocuments(res.documents || []);
      setVerificationStatus(res.overall_status || 'incomplete');
    } catch (e) { console.log('Docs fetch error:', e); }
    setLoading(false);
    setRefreshing(false);
  };

  const uploadDoc = async (docKey: string, useCamera: boolean) => {
    try {
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permiso', 'Necesitamos acceso a la cámara.'); return; }
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.3, base64: true, allowsEditing: true, aspect: [1, 1] })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.3, base64: true });

      if (result.canceled || !result.assets || !result.assets[0]?.base64) return;

      setUploading(docKey);
      const base64Data = `data:image/jpeg;base64,${result.assets[0].base64}`;

      const response = await apiService.post('/driver/documents/upload-base64', {
        doc_type: docKey,
        file_base64: base64Data,
      });

      if (response.status === 'uploaded') {
        fetchDocs();
      } else {
        Alert.alert('Error', response.detail || 'No se pudo subir');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Error al subir');
    }
    setUploading(null);
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'approved': return { icon: 'checkmark-circle', color: GREEN, label: 'Aprobado', bg: '#E8F5E9' };
      case 'rejected': return { icon: 'close-circle', color: '#FF3B30', label: 'Rechazado', bg: '#FFEBEE' };
      case 'pending': return { icon: 'time', color: '#FF9500', label: 'En revisión', bg: '#FFF3E0' };
      default: return { icon: 'cloud-upload-outline', color: '#8E8E93', label: 'Sin subir', bg: '#F2F2F7' };
    }
  };

  const anyUploaded = documents.some(d => d.status !== 'not_uploaded');
  const allUploaded = documents.length > 0 && documents.every(d => d.status !== 'not_uploaded');
  const uploadedCount = documents.filter(d => d.status !== 'not_uploaded').length;

  if (loading) return <SafeAreaView style={s.container}><View style={s.center}><ActivityIndicator size="large" color={GREEN} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Mis Documentos</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDocs(); }} tintColor={GREEN} />}
      >
        {/* Status Banner */}
        <View style={[s.statusBanner, {
          borderLeftColor: verificationStatus === 'approved' ? GREEN : verificationStatus === 'pending' ? '#FF9500' : '#007AFF',
        }]}>
          <Ionicons
            name={(verificationStatus === 'approved' ? 'shield-checkmark' : verificationStatus === 'pending' ? 'hourglass-outline' : 'documents-outline') as any}
            size={24}
            color={verificationStatus === 'approved' ? GREEN : verificationStatus === 'pending' ? '#FF9500' : '#007AFF'}
          />
          <Text style={s.statusText}>
            {verificationStatus === 'approved' ? '¡Verificado! Podés aceptar viajes.' :
             verificationStatus === 'pending' ? 'Documentos en revisión.' :
             'Subí tus documentos para poder trabajar.'}
          </Text>
        </View>

        {/* Progress */}
        <View style={s.progressCard}>
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${(uploadedCount / Math.max(documents.length, 1)) * 100}%` }]} />
          </View>
          <Text style={s.progressText}>{uploadedCount}/{documents.length} subidos</Text>
        </View>

        {/* Continue button (shows with 1+ uploaded) */}
        {anyUploaded && verificationStatus !== 'approved' && (
          <TouchableOpacity
            style={s.continueBtn}
            onPress={() => router.replace('/(driver)/home')}
          >
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={s.continueBtnText}>
              {allUploaded ? 'Continuar (en revisión)' : `Continuar (${uploadedCount}/${documents.length} subidos)`}
            </Text>
          </TouchableOpacity>
        )}

        {/* Selfie / Profile Photo */}
        <View style={s.selfieCard}>
          <View style={s.selfieIcon}>
            <Ionicons name="camera" size={28} color={GREEN} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.selfieTitle}>Foto de perfil (Selfie)</Text>
            <Text style={s.selfieDesc}>Sacate una selfie para tu perfil de conductor</Text>
          </View>
          <TouchableOpacity style={s.selfieBtn} onPress={() => uploadDoc('selfie', true)} disabled={uploading === 'selfie'}>
            {uploading === 'selfie' ? <ActivityIndicator size="small" color="#fff" /> : (
              <><Ionicons name="camera" size={16} color="#fff" /><Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>Selfie</Text></>
            )}
          </TouchableOpacity>
        </View>

        {/* Document List */}
        {documents.map((doc) => {
          const cfg = getStatusConfig(doc.status);
          const isUploading = uploading === doc.key;

          return (
            <View key={doc.key} style={s.docCard}>
              <View style={s.docTop}>
                <View style={[s.docBadge, { backgroundColor: cfg.bg }]}>
                  <Ionicons name={cfg.icon as any} size={14} color={cfg.color} />
                  <Text style={[s.docBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              </View>

              <Text style={s.docLabel}>{doc.label}</Text>
              <Text style={s.docDesc}>{doc.description}</Text>

              {doc.status === 'rejected' && doc.reject_reason ? (
                <View style={s.rejectBox}>
                  <Ionicons name="alert-circle" size={14} color="#FF3B30" />
                  <Text style={s.rejectText}>{doc.reject_reason}</Text>
                </View>
              ) : null}

              {(doc.status === 'not_uploaded' || doc.status === 'rejected') && (
                <View style={s.uploadRow}>
                  <TouchableOpacity style={s.galleryBtn} onPress={() => uploadDoc(doc.key, false)} disabled={isUploading}>
                    {isUploading ? <ActivityIndicator color="#fff" size="small" /> : (
                      <><Ionicons name="images" size={16} color="#fff" /><Text style={s.galleryBtnText}>Galería</Text></>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity style={s.cameraBtn} onPress={() => uploadDoc(doc.key, true)} disabled={isUploading}>
                    <Ionicons name="camera" size={16} color={GREEN} /><Text style={s.cameraBtnText}>Cámara</Text>
                  </TouchableOpacity>
                </View>
              )}

              {doc.status === 'pending' && (
                <View style={s.pendingRow}>
                  <Ionicons name="time-outline" size={14} color="#FF9500" />
                  <Text style={s.pendingText}>En revisión por Moli</Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E5E5EA', gap: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  statusBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, padding: 14, borderRadius: 14, borderLeftWidth: 4 },
  statusText: { fontSize: 14, fontWeight: '600', color: '#1C1C1E', flex: 1 },
  progressCard: { marginHorizontal: 16, marginTop: 10, backgroundColor: '#fff', borderRadius: 12, padding: 12 },
  progressBar: { height: 8, borderRadius: 4, backgroundColor: '#E5E5EA', overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: GREEN },
  progressText: { fontSize: 12, color: '#8E8E93', marginTop: 6, textAlign: 'center' },
  continueBtn: { marginHorizontal: 16, marginTop: 12, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  continueBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  selfieCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 14, gap: 12, borderWidth: 1, borderColor: '#E5E5EA' },
  selfieIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' },
  selfieTitle: { fontSize: 14, fontWeight: '700', color: '#1C1C1E' },
  selfieDesc: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  selfieBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: GREEN, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  docCard: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 10, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E5E5EA' },
  docTop: { flexDirection: 'row', justifyContent: 'flex-end' },
  docBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  docBadgeText: { fontSize: 11, fontWeight: '600' },
  docLabel: { fontSize: 16, fontWeight: '700', color: '#1C1C1E', marginTop: 4 },
  docDesc: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  rejectBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFEBEE', borderRadius: 8, padding: 8, marginTop: 8 },
  rejectText: { fontSize: 12, color: '#FF3B30', flex: 1 },
  uploadRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  galleryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: GREEN, borderRadius: 10, paddingVertical: 12 },
  galleryBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  cameraBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 10, paddingVertical: 12, borderWidth: 1, borderColor: GREEN },
  cameraBtnText: { color: GREEN, fontWeight: '600', fontSize: 14 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  pendingText: { fontSize: 12, color: '#FF9500' },
});
