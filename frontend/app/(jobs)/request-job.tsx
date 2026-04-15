import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  ScrollView, TextInput, Alert, ActivityIndicator, Image,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { apiService } from '@/src/services/api';
import { useAuthStore } from '@/src/stores/authStore';

const CATEGORIES = [
  { id: 'electricista', name: 'Electricista', icon: 'flash', color: '#FF9500' },
  { id: 'plomero', name: 'Plomero', icon: 'water', color: '#007AFF' },
  { id: 'limpieza', name: 'Limpieza', icon: 'sparkles', color: '#34C759' },
  { id: 'mudanza', name: 'Mudanza', icon: 'cube', color: '#AF52DE' },
  { id: 'pintura', name: 'Pintura', icon: 'color-palette', color: '#FF3B30' },
  { id: 'jardineria', name: 'Jardinería', icon: 'leaf', color: '#00C853' },
  { id: 'carpinteria', name: 'Carpintería', icon: 'hammer', color: '#8B4513' },
  { id: 'mecanica', name: 'Mecánica', icon: 'construct', color: '#636366' },
  { id: 'tecnologia', name: 'Tecnología', icon: 'laptop', color: '#5856D6' },
  { id: 'otro', name: 'Otro', icon: 'ellipsis-horizontal', color: '#8E8E93' },
];

type Phase = 'category' | 'details' | 'searching' | 'matched' | 'active';

export default function RequestJobScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [phase, setPhase] = useState<Phase>('category');
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [address, setAddress] = useState('Mi ubicación');
  const [location, setLocation] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [professional, setProfessional] = useState<any>(null);
  const [searchAttempts, setSearchAttempts] = useState(0);

  // Auto-detect location
  useEffect(() => {
    (async () => {
      try {
        const loc = await import('expo-location');
        const { status } = await loc.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await loc.getCurrentPositionAsync({});
          setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
          // Reverse geocode
          try {
            const r = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/places/reverse?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`);
            const d = await r.json();
            if (d.address) setAddress(d.address);
          } catch {}
        }
      } catch {}
    })();
  }, []);

  // Poll for job acceptance when searching
  useEffect(() => {
    if (phase !== 'searching' || !jobId) return;
    const interval = setInterval(async () => {
      try {
        const r = await apiService.get(`/jobs/detail/${jobId}`);
        setSearchAttempts(prev => prev + 1);
        if (r.job?.status === 'assigned') {
          setProfessional({
            name: r.job.assigned_name,
            id: r.job.assigned_to,
          });
          setPhase('matched');
          clearInterval(interval);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [phase, jobId]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) { Alert.alert('Error', 'Escribí un título'); return; }
    if (!budget || parseFloat(budget) <= 0) { Alert.alert('Error', 'Ingresá cuánto querés pagar'); return; }
    setLoading(true);
    try {
      const res = await apiService.post('/jobs/post', {
        category,
        title: title.trim(),
        description: description.trim(),
        budget: parseFloat(budget),
        location,
        address,
        images: photo ? [photo] : [],
      });
      setJobId(res.job?.job_id);
      setPhase('searching');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo publicar');
    } finally { setLoading(false); }
  };

  const handleCancel = async () => {
    if (jobId) {
      try { await apiService.put(`/jobs/${jobId}/status`, { status: 'cancelled' }); } catch {}
    }
    router.back();
  };

  const catData = CATEGORIES.find(c => c.id === category);

  // ── PHASE: SELECT CATEGORY ──
  if (phase === 'category') {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>¿Qué necesitás?</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={s.catCard}
              onPress={() => { setCategory(cat.id); setPhase('details'); }}
            >
              <View style={[s.catIcon, { backgroundColor: cat.color + '18' }]}>
                <Ionicons name={cat.icon as any} size={26} color={cat.color} />
              </View>
              <Text style={s.catName}>{cat.name}</Text>
              <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── PHASE: FILL DETAILS ──
  if (phase === 'details') {
    return (
      <SafeAreaView style={s.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <View style={s.header}>
              <TouchableOpacity onPress={() => setPhase('category')} style={s.backBtn}>
                <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
              </TouchableOpacity>
              <Text style={s.headerTitle}>{catData?.name || 'Nuevo trabajo'}</Text>
            </View>

            <View style={{ padding: 20, gap: 16 }}>
              <View>
                <Text style={s.label}>¿Qué necesitás? *</Text>
                <TextInput style={s.input} placeholder="Ej: Arreglar canilla que gotea" placeholderTextColor="#C7C7CC" value={title} onChangeText={setTitle} />
              </View>

              <View>
                <Text style={s.label}>Descripción (opcional)</Text>
                <TextInput style={[s.input, { minHeight: 80 }]} placeholder="Detalles del trabajo..." placeholderTextColor="#C7C7CC" value={description} onChangeText={setDescription} multiline textAlignVertical="top" />
              </View>

              <View>
                <Text style={s.label}>Foto del trabajo (opcional)</Text>
                <TouchableOpacity style={s.photoBtn} onPress={pickImage}>
                  {photo ? (
                    <Image source={{ uri: photo }} style={{ width: '100%', height: 150, borderRadius: 12 }} resizeMode="cover" />
                  ) : (
                    <View style={{ alignItems: 'center', gap: 8 }}>
                      <Ionicons name="camera" size={32} color="#C7C7CC" />
                      <Text style={{ color: '#8E8E93', fontSize: 13 }}>Subir foto</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              <View>
                <Text style={s.label}>¿Cuánto querés pagar? *</Text>
                <View style={s.priceRow}>
                  <Text style={{ fontSize: 24, fontWeight: '800', color: '#1C1C1E' }}>$</Text>
                  <TextInput style={s.priceInput} placeholder="2000" placeholderTextColor="#C7C7CC" value={budget} onChangeText={setBudget} keyboardType="numeric" />
                </View>
              </View>

              <View>
                <Text style={s.label}>Ubicación</Text>
                <View style={s.locationRow}>
                  <Ionicons name="location" size={20} color="#00C853" />
                  <Text style={{ flex: 1, fontSize: 14, color: '#1C1C1E' }}>{address}</Text>
                </View>
              </View>

              <TouchableOpacity style={s.submitBtn} onPress={handleSubmit} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : (
                  <Text style={s.submitBtnText}>Buscar profesional</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── PHASE: SEARCHING ──
  if (phase === 'searching') {
    return (
      <SafeAreaView style={s.container}>
        <View style={[s.center, { padding: 40 }]}>
          <ActivityIndicator size="large" color="#00C853" />
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#1C1C1E', marginTop: 24, textAlign: 'center' }}>
            Buscando profesional...
          </Text>
          <Text style={{ fontSize: 14, color: '#8E8E93', marginTop: 8, textAlign: 'center' }}>
            Estamos buscando un {catData?.name?.toLowerCase() || 'profesional'} cerca tuyo
          </Text>
          {searchAttempts > 10 && (
            <Text style={{ fontSize: 13, color: '#FF9500', marginTop: 12, textAlign: 'center' }}>
              Está tardando más de lo normal. Podés seguir esperando o cancelar.
            </Text>
          )}
          <TouchableOpacity style={s.cancelBtn} onPress={handleCancel}>
            <Text style={{ color: '#FF3B30', fontWeight: '600', fontSize: 15 }}>Cancelar búsqueda</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── PHASE: MATCHED ──
  if (phase === 'matched') {
    return (
      <SafeAreaView style={s.container}>
        <View style={[s.center, { padding: 40 }]}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0,200,83,0.1)', justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="checkmark-circle" size={48} color="#00C853" />
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#1C1C1E', marginTop: 20, textAlign: 'center' }}>
            ¡Profesional encontrado!
          </Text>
          <Text style={{ fontSize: 16, color: '#636366', marginTop: 8, textAlign: 'center' }}>
            {professional?.name || 'Un profesional'} aceptó tu trabajo y está en camino
          </Text>
          <TouchableOpacity
            style={[s.submitBtn, { marginTop: 24 }]}
            onPress={() => {
              if (jobId) {
                router.push({ pathname: '/chat', params: { rideId: jobId, otherName: professional?.name || 'Profesional' } });
              }
            }}
          >
            <Ionicons name="chatbubble" size={20} color="#fff" />
            <Text style={s.submitBtnText}> Chatear con el profesional</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ marginTop: 16 }} onPress={() => router.back()}>
            <Text style={{ color: '#8E8E93', fontSize: 14 }}>Volver al inicio</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return null;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginLeft: 12 },
  catCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F8FA', borderRadius: 16, padding: 16 },
  catIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  catName: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1C1C1E', marginLeft: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#8E8E93', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: { backgroundColor: '#F2F2F7', borderRadius: 14, padding: 14, fontSize: 15, color: '#1C1C1E' },
  photoBtn: { backgroundColor: '#F8F8FA', borderRadius: 14, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#E5E5EA', borderStyle: 'dashed' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F2F2F7', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10 },
  priceInput: { flex: 1, fontSize: 28, fontWeight: '800', color: '#1C1C1E' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F2F2F7', borderRadius: 14, padding: 14 },
  submitBtn: { flexDirection: 'row', backgroundColor: '#00C853', paddingVertical: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  submitBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  cancelBtn: { marginTop: 24, paddingVertical: 14 },
});
