import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/src/services/api';

export default function JobDetailScreen() {
  const router = useRouter();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const [job, setJob] = useState<any>(null);
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOffer, setShowOffer] = useState(false);
  const [price, setPrice] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (jobId) loadJob();
  }, [jobId]);

  const loadJob = async () => {
    try {
      const res = await apiService.get(`/jobs/detail/${jobId}`);
      setJob(res.job);
      setOffers(res.offers || []);
    } catch (e) { console.log('Job load error', e); }
    finally { setLoading(false); }
  };

  const handleSendOffer = async () => {
    if (!price || parseFloat(price) <= 0) { Alert.alert('Error', 'Ingresá un precio válido'); return; }
    setSending(true);
    try {
      await apiService.post(`/jobs/${jobId}/offer`, {
        price: parseFloat(price),
        message: message.trim(),
      });
      Alert.alert('Oferta enviada', 'El cliente recibirá tu propuesta');
      setShowOffer(false);
      loadJob();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo enviar la oferta');
    } finally { setSending(false); }
  };

  if (loading) return (
    <SafeAreaView style={s.container}>
      <View style={s.center}><ActivityIndicator size="large" color="#00C853" /></View>
    </SafeAreaView>
  );

  if (!job) return (
    <SafeAreaView style={s.container}>
      <View style={s.center}><Text>Trabajo no encontrado</Text></View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
              <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Detalle del trabajo</Text>
          </View>

          <View style={{ padding: 20 }}>
            <Text style={s.title}>{job.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <View style={{ backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#00C853' }}>{job.category}</Text>
              </View>
              <Text style={{ fontSize: 12, color: '#8E8E93' }}>por {job.client_name}</Text>
            </View>

            <Text style={s.budget}>${job.budget?.toLocaleString()}</Text>
            <Text style={s.budgetLabel}>Presupuesto estimado</Text>

            <Text style={s.sectionLabel}>Descripción</Text>
            <Text style={s.description}>{job.description}</Text>

            {job.address ? (
              <>
                <Text style={s.sectionLabel}>Ubicación</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="location" size={16} color="#00C853" />
                  <Text style={s.description}>{job.address}</Text>
                </View>
              </>
            ) : null}

            <Text style={s.sectionLabel}>Ofertas ({offers.length})</Text>
            {offers.map((o, i) => (
              <View key={o.offer_id || i} style={s.offerCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={s.offerName}>{o.professional_name}</Text>
                  <Text style={s.offerPrice}>${o.price?.toLocaleString()}</Text>
                </View>
                {o.message ? <Text style={s.offerMsg}>{o.message}</Text> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <Ionicons name="star" size={14} color="#FFD700" />
                  <Text style={{ fontSize: 12, color: '#636366' }}>{(o.professional_rating || 5).toFixed(1)}</Text>
                </View>
              </View>
            ))}

            {/* Send offer section */}
            {job.status === 'open' && (
              !showOffer ? (
                <TouchableOpacity style={s.offerBtn} onPress={() => setShowOffer(true)}>
                  <Ionicons name="paper-plane" size={20} color="#fff" />
                  <Text style={s.offerBtnText}>Enviar mi oferta</Text>
                </TouchableOpacity>
              ) : (
                <View style={s.offerForm}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#1C1C1E', marginBottom: 12 }}>Tu oferta</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <Text style={{ fontSize: 24, fontWeight: '700' }}>$</Text>
                    <TextInput
                      style={s.priceInput}
                      placeholder="Precio"
                      placeholderTextColor="#C7C7CC"
                      value={price}
                      onChangeText={setPrice}
                      keyboardType="numeric"
                    />
                  </View>
                  <TextInput
                    style={s.msgInput}
                    placeholder="Mensaje al cliente (opcional)"
                    placeholderTextColor="#8E8E93"
                    value={message}
                    onChangeText={setMessage}
                    multiline
                  />
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <TouchableOpacity style={s.cancelBtn} onPress={() => setShowOffer(false)}>
                      <Text style={{ color: '#636366', fontWeight: '600' }}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.submitBtn} onPress={handleSendOffer} disabled={sending}>
                      {sending ? <ActivityIndicator color="#fff" size="small" /> : (
                        <Text style={{ color: '#fff', fontWeight: '700' }}>Enviar</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginLeft: 12 },
  title: { fontSize: 24, fontWeight: '800', color: '#1C1C1E' },
  budget: { fontSize: 36, fontWeight: '800', color: '#00C853', marginTop: 20 },
  budgetLabel: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: '#8E8E93', marginTop: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  description: { fontSize: 15, color: '#1C1C1E', lineHeight: 22 },
  offerCard: { backgroundColor: '#F8F8FA', borderRadius: 14, padding: 14, marginBottom: 8 },
  offerName: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  offerPrice: { fontSize: 18, fontWeight: '800', color: '#00C853' },
  offerMsg: { fontSize: 13, color: '#636366', marginTop: 4 },
  offerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#00C853', paddingVertical: 16, borderRadius: 14, marginTop: 24 },
  offerBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  offerForm: { backgroundColor: '#F8F8FA', borderRadius: 16, padding: 16, marginTop: 20 },
  priceInput: { flex: 1, fontSize: 24, fontWeight: '700', color: '#1C1C1E', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  msgInput: { backgroundColor: '#fff', borderRadius: 12, padding: 14, fontSize: 14, color: '#1C1C1E', minHeight: 60 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#E5E5EA', alignItems: 'center' },
  submitBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#00C853', alignItems: 'center' },
});
