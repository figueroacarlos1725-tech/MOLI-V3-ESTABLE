import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { apiService } from '@/src/services/api';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DocItem {
  key: string;
  label: string;
  description: string;
  status: 'not_uploaded' | 'pending' | 'approved' | 'rejected';
  uploaded_at?: string;
  reject_reason?: string;
  document_id?: string;
}

export default function DriverDocumentsScreen() {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [verificationStatus, setVerificationStatus] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await apiService.get('/driver/documents/required');
      setDocuments(res?.documents || []);
      setVerificationStatus(res?.verification_status || 'incomplete');
      setIsVerified(res?.is_verified || false);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const handleUpload = async (docKey: string) => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso', 'Necesitamos acceso a tu galería para subir documentos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        base64: false,
      });

      if (result.canceled) return;

      setUploading(docKey);
      const imageUri = result.assets[0].uri;
      const token = await AsyncStorage.getItem('auth_token');
      const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';

      const formData = new FormData();
      if (typeof window !== 'undefined' && (imageUri.startsWith('blob:') || imageUri.startsWith('data:'))) {
        const resp = await fetch(imageUri);
        const blob = await resp.blob();
        formData.append('file', blob, `${docKey}.jpg`);
      } else {
        formData.append('file', {
          uri: imageUri,
          type: 'image/jpeg',
          name: `${docKey}.jpg`,
        } as any);
      }

      const response = await fetch(`${backendUrl}/api/driver/documents/upload?doc_type=${docKey}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      const data = await response.json();
      if (data.status === 'uploaded') {
        fetchDocs();
      } else {
        Alert.alert('Error', data.detail || 'No se pudo subir el documento');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Error al subir documento');
    } finally {
      setUploading(null);
    }
  };

  const handleCamera = async (docKey: string) => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso', 'Necesitamos acceso a la cámara para tomar fotos de documentos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        base64: false,
      });

      if (result.canceled) return;

      setUploading(docKey);
      const imageUri = result.assets[0].uri;
      const token = await AsyncStorage.getItem('auth_token');
      const backendUrl = Constants.expoConfig?.extra?.EXPO_BACKEND_URL || process.env.EXPO_PUBLIC_API_URL || '';

      const formData = new FormData();
      formData.append('file', {
        uri: imageUri,
        type: 'image/jpeg',
        name: `${docKey}.jpg`,
      } as any);

      const response = await fetch(`${backendUrl}/api/driver/documents/upload?doc_type=${docKey}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      const data = await response.json();
      if (data.status === 'uploaded') {
        fetchDocs();
      } else {
        Alert.alert('Error', data.detail || 'No se pudo subir el documento');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Error al subir documento');
    } finally {
      setUploading(null);
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'approved': return { icon: 'checkmark-circle', color: '#00C853', label: 'Aprobado', bg: '#F0FFF0' };
      case 'rejected': return { icon: 'close-circle', color: '#FF3B30', label: 'Rechazado', bg: '#FFF5F5' };
      case 'pending': return { icon: 'time', color: '#FF9500', label: 'En revisión', bg: '#FFF8E6' };
      default: return { icon: 'cloud-upload-outline', color: '#8E8E93', label: 'Sin subir', bg: '#F2F2F7' };
    }
  };

  const overallConfig = {
    approved: { icon: 'shield-checkmark', color: '#00C853', text: '¡Verificado! Puedes aceptar viajes.' },
    pending: { icon: 'hourglass-outline', color: '#FF9500', text: 'Documentos en revisión. Te avisaremos pronto.' },
    rejected: { icon: 'alert-circle', color: '#FF3B30', text: 'Algunos documentos fueron rechazados. Vuelve a subirlos.' },
    incomplete: { icon: 'documents-outline', color: '#007AFF', text: 'Sube todos los documentos requeridos para poder aceptar viajes.' },
  };

  const overall = overallConfig[verificationStatus as keyof typeof overallConfig] || overallConfig.incomplete;

  if (loading) return <SafeAreaView style={st.container}><ActivityIndicator size="large" color="#00C853" style={{ marginTop: 40 }} /></SafeAreaView>;

  return (
    <SafeAreaView style={st.container}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
          <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={st.title}>Mis Documentos</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDocs(); }} />}
      >
        {/* Overall Status Banner */}
        <View style={[st.statusBanner, { borderLeftColor: overall.color }]}>
          <Ionicons name={overall.icon as any} size={28} color={overall.color} />
          <Text style={st.statusBannerText}>{overall.text}</Text>
        </View>

        {/* Progress */}
        <View style={st.progressCard}>
          <View style={st.progressBar}>
            <View style={[st.progressFill, { width: `${(documents.filter(d => d.status === 'approved').length / documents.length) * 100}%` }]} />
          </View>
          <Text style={st.progressText}>
            {documents.filter(d => d.status === 'approved').length}/{documents.length} aprobados
          </Text>
        </View>

        {/* Document List */}
        {documents.map((doc) => {
          const cfg = getStatusConfig(doc.status);
          const isUploading = uploading === doc.key;

          return (
            <View key={doc.key} style={st.docCard}>
              <View style={st.docTop}>
                <View style={[st.docStatusBadge, { backgroundColor: cfg.bg }]}>
                  <Ionicons name={cfg.icon as any} size={16} color={cfg.color} />
                  <Text style={[st.docStatusText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              </View>
              
              <Text style={st.docLabel}>{doc.label}</Text>
              <Text style={st.docDesc}>{doc.description}</Text>

              {doc.status === 'rejected' && doc.reject_reason ? (
                <View style={st.rejectBox}>
                  <Ionicons name="alert-circle" size={14} color="#FF3B30" />
                  <Text style={st.rejectText}>{doc.reject_reason}</Text>
                </View>
              ) : null}

              {(doc.status === 'not_uploaded' || doc.status === 'rejected') && (
                <View style={st.uploadActions}>
                  <TouchableOpacity style={st.uploadBtn} onPress={() => handleUpload(doc.key)} disabled={isUploading}>
                    {isUploading ? <ActivityIndicator color="#fff" size="small" /> : (
                      <><Ionicons name="images-outline" size={18} color="#fff" /><Text style={st.uploadBtnText}>Galería</Text></>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity style={st.cameraBtn} onPress={() => handleCamera(doc.key)} disabled={isUploading}>
                    <Ionicons name="camera-outline" size={18} color="#00C853" /><Text style={st.cameraBtnText}>Cámara</Text>
                  </TouchableOpacity>
                </View>
              )}

              {doc.status === 'pending' && (
                <View style={st.pendingHint}>
                  <Ionicons name="time-outline" size={14} color="#FF9500" />
                  <Text style={st.pendingHintText}>En revisión por el equipo de Moli</Text>
                </View>
              )}
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: { backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E5E5EA', flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: '#1C1C1E' },
  statusBanner: { marginHorizontal: 16, marginTop: 16, backgroundColor: '#fff', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderLeftWidth: 4 },
  statusBannerText: { flex: 1, fontSize: 14, color: '#1C1C1E', fontWeight: '600', lineHeight: 20 },
  progressCard: { marginHorizontal: 16, marginTop: 12, backgroundColor: '#fff', borderRadius: 14, padding: 16 },
  progressBar: { height: 8, borderRadius: 4, backgroundColor: '#E5E5EA' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: '#00C853' },
  progressText: { fontSize: 13, color: '#8E8E93', marginTop: 8, fontWeight: '600', textAlign: 'center' },
  docCard: { marginHorizontal: 16, marginTop: 12, backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  docTop: { flexDirection: 'row', marginBottom: 8 },
  docStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  docStatusText: { fontSize: 12, fontWeight: '700' },
  docLabel: { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  docDesc: { fontSize: 13, color: '#8E8E93', marginTop: 4, lineHeight: 18 },
  rejectBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#FFF5F5', padding: 10, borderRadius: 10, marginTop: 10 },
  rejectText: { flex: 1, fontSize: 13, color: '#FF3B30', fontWeight: '500' },
  uploadActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  uploadBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#00C853', borderRadius: 12, paddingVertical: 14 },
  uploadBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cameraBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#F2F2F7', borderRadius: 12, paddingVertical: 14 },
  cameraBtnText: { color: '#00C853', fontSize: 15, fontWeight: '700' },
  pendingHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  pendingHintText: { fontSize: 13, color: '#FF9500', fontWeight: '500' },
});
