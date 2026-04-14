import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  ActivityIndicator, ScrollView, Dimensions, Platform, TextInput, Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/src/services/api';
import { useAuthStore } from '@/src/stores/authStore';

const { width, height } = Dimensions.get('window');

const CAT_ICONS: Record<string, { icon: string; color: string }> = {
  electricista: { icon: '⚡', color: '#FF9500' },
  plomero: { icon: '🔧', color: '#007AFF' },
  limpieza: { icon: '✨', color: '#34C759' },
  mudanza: { icon: '📦', color: '#AF52DE' },
  pintura: { icon: '🎨', color: '#FF3B30' },
  jardineria: { icon: '🌿', color: '#00C853' },
  carpinteria: { icon: '🔨', color: '#8B4513' },
  mecanica: { icon: '🔩', color: '#636366' },
  tecnologia: { icon: '💻', color: '#5856D6' },
  otro: { icon: '📋', color: '#8E8E93' },
};

export default function JobsHomeScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const webViewRef = useRef<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [offerPrice, setOfferPrice] = useState('');
  const [offerMsg, setOfferMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [myOffers, setMyOffers] = useState<any[]>([]);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [catsRes, jobsRes, profileRes, offersRes] = await Promise.all([
        apiService.get('/jobs/categories'),
        apiService.get('/jobs/posts?status=open'),
        apiService.get('/jobs/professional/profile'),
        apiService.get('/jobs/my-offers'),
      ]);
      setCategories(catsRes.categories || []);
      setJobs(jobsRes.jobs || []);
      setHasProfile(profileRes.has_profile);
      setMyOffers(offersRes.offers || []);
    } catch (e) { console.log('Jobs load error', e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (webViewRef.current && jobs.length > 0) {
      const filtered = selectedCat ? jobs.filter(j => j.category === selectedCat) : jobs;
      const markersJs = filtered.map(j => {
        const lat = j.location?.latitude || -28.47;
        const lng = j.location?.longitude || -65.78;
        const cat = CAT_ICONS[j.category] || CAT_ICONS.otro;
        const alreadyOffered = myOffers.some(o => o.job_id === j.job_id);
        return `addJobMarker(${lat}, ${lng}, '${j.job_id}', '${cat.icon}', '${j.title?.replace(/'/g, '')}', ${j.budget || 0}, '${j.category}', ${alreadyOffered});`;
      }).join('\n');
      webViewRef.current.injectJavaScript(`clearMarkers(); ${markersJs}; true;`);
    }
  }, [jobs, selectedCat, myOffers]);

  const getMapHtml = () => `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>body,html{margin:0;padding:0;height:100%}#map{height:100%;width:100%}</style>
</head><body>
<div id="map"></div>
<script>
var map=L.map('map',{zoomControl:false}).setView([-28.47,-65.78],13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
var markers=[];
function clearMarkers(){markers.forEach(m=>map.removeLayer(m));markers=[];}
function addJobMarker(lat,lng,jobId,emoji,title,budget,cat,offered){
  var icon=L.divIcon({
    html:'<div style="width:44px;height:44px;border-radius:14px;background:'+(offered?'#E5E5EA':'#fff')+';display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 2px 8px rgba(0,0,0,0.15);border:2px solid '+(offered?'#C7C7CC':'#00C853')+'">'+emoji+'</div>',
    className:'',iconSize:[44,44],iconAnchor:[22,44]
  });
  var m=L.marker([lat,lng],{icon:icon}).addTo(map);
  m.on('click',function(){
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'job_selected',job_id:jobId}));
  });
  markers.push(m);
}
</script>
</body></html>`;

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'job_selected') {
        const job = jobs.find(j => j.job_id === data.job_id);
        if (job) {
          setSelectedJob(job);
          setShowOfferForm(false);
          setOfferPrice('');
          setOfferMsg('');
        }
      }
    } catch (e) {}
  };

  const handleSendOffer = async () => {
    if (!offerPrice || parseFloat(offerPrice) <= 0) {
      Alert.alert('Error', 'Ingresá un precio válido');
      return;
    }
    setSending(true);
    try {
      await apiService.post(`/jobs/${selectedJob.job_id}/offer`, {
        price: parseFloat(offerPrice),
        message: offerMsg.trim(),
      });
      Alert.alert('¡Oferta enviada!', 'El cliente recibirá tu propuesta');
      setSelectedJob(null);
      setShowOfferForm(false);
      loadAll();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo enviar');
    } finally { setSending(false); }
  };

  if (loading) return (
    <SafeAreaView style={s.container}>
      <View style={s.center}><ActivityIndicator size="large" color="#00C853" /></View>
    </SafeAreaView>
  );

  if (!hasProfile) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Moli Trabajos</Text>
        </View>
        <View style={s.center}>
          <View style={s.setupIcon}>
            <Ionicons name="briefcase" size={40} color="#00C853" />
          </View>
          <Text style={s.setupTitle}>Configurá tu perfil profesional</Text>
          <Text style={s.setupSubtitle}>
            Completá tu perfil para poder ver trabajos disponibles y enviar ofertas.
          </Text>
          <TouchableOpacity style={s.setupBtn} onPress={() => router.push('/(jobs)/setup-profile')}>
            <Text style={s.setupBtnText}>Completar perfil</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const filteredJobs = selectedCat ? jobs.filter(j => j.category === selectedCat) : jobs;

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Moli Trabajos</Text>
        <View style={s.jobCount}>
          <Text style={s.jobCountText}>{filteredJobs.length}</Text>
        </View>
      </View>

      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll} contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}>
        <TouchableOpacity style={[s.catChip, !selectedCat && s.catChipActive]} onPress={() => setSelectedCat(null)}>
          <Text style={[s.catChipText, !selectedCat && s.catChipTextActive]}>Todos</Text>
        </TouchableOpacity>
        {categories.map(c => (
          <TouchableOpacity
            key={c.category_id || c.id}
            style={[s.catChip, selectedCat === (c.category_id || c.id) && s.catChipActive]}
            onPress={() => setSelectedCat(c.category_id || c.id)}
          >
            <Text style={{ fontSize: 14 }}>{CAT_ICONS[c.category_id || c.id]?.icon || '📋'}</Text>
            <Text style={[s.catChipText, selectedCat === (c.category_id || c.id) && s.catChipTextActive]}>{c.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Map */}
      <View style={{ flex: 1 }}>
        {Platform.OS === 'web' ? (
          <iframe
            srcDoc={getMapHtml()}
            style={{ width: '100%', height: '100%', border: 'none' } as any}
          />
        ) : (
          <WebView
            ref={webViewRef}
            source={{ html: getMapHtml() }}
            onMessage={handleWebViewMessage}
            style={{ flex: 1 }}
            javaScriptEnabled
          />
        )}
      </View>

      {/* Selected job bottom sheet */}
      {selectedJob && (
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <TouchableOpacity style={s.sheetClose} onPress={() => setSelectedJob(null)}>
            <Ionicons name="close" size={20} color="#636366" />
          </TouchableOpacity>

          {!showOfferForm ? (
            <>
              <View style={s.sheetHeader}>
                <Text style={s.sheetEmoji}>{CAT_ICONS[selectedJob.category]?.icon || '📋'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.sheetTitle}>{selectedJob.title}</Text>
                  <Text style={s.sheetCat}>{selectedJob.category} · {selectedJob.client_name}</Text>
                </View>
                <Text style={s.sheetBudget}>${selectedJob.budget?.toLocaleString()}</Text>
              </View>
              <Text style={s.sheetDesc} numberOfLines={3}>{selectedJob.description}</Text>
              {selectedJob.address ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                  <Ionicons name="location" size={14} color="#00C853" />
                  <Text style={{ fontSize: 13, color: '#636366' }}>{selectedJob.address}</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <TouchableOpacity
                  style={s.offerBtn}
                  onPress={() => {
                    if (myOffers.some(o => o.job_id === selectedJob.job_id)) {
                      Alert.alert('Ya ofertaste', 'Ya enviaste una oferta para este trabajo');
                    } else {
                      setShowOfferForm(true);
                    }
                  }}
                >
                  <Ionicons name="paper-plane" size={18} color="#fff" />
                  <Text style={s.offerBtnText}>
                    {myOffers.some(o => o.job_id === selectedJob.job_id) ? 'Ya ofertaste' : 'Enviar oferta'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#1C1C1E', marginBottom: 12 }}>Tu oferta para "{selectedJob.title}"</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#1C1C1E' }}>$</Text>
                <TextInput
                  style={s.priceInput}
                  placeholder="Precio"
                  placeholderTextColor="#C7C7CC"
                  value={offerPrice}
                  onChangeText={setOfferPrice}
                  keyboardType="numeric"
                  autoFocus
                />
              </View>
              <TextInput
                style={s.msgInput}
                placeholder="Mensaje al cliente (opcional)"
                placeholderTextColor="#8E8E93"
                value={offerMsg}
                onChangeText={setOfferMsg}
                multiline
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setShowOfferForm(false)}>
                  <Text style={{ color: '#636366', fontWeight: '600', fontSize: 15 }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.submitBtn} onPress={handleSendOffer} disabled={sending}>
                  {sending ? <ActivityIndicator color="#fff" size="small" /> : (
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Enviar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginLeft: 12, flex: 1 },
  jobCount: { backgroundColor: '#00C853', width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  jobCountText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  catScroll: { maxHeight: 50, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F2F2F7' },
  catChipActive: { backgroundColor: '#00C853' },
  catChipText: { fontSize: 12, fontWeight: '600', color: '#636366' },
  catChipTextActive: { color: '#fff' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 10 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D1D6', alignSelf: 'center', marginBottom: 12 },
  sheetClose: { position: 'absolute', top: 16, right: 16, zIndex: 1 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  sheetEmoji: { fontSize: 32 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#1C1C1E' },
  sheetCat: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  sheetBudget: { fontSize: 22, fontWeight: '800', color: '#00C853' },
  sheetDesc: { fontSize: 14, color: '#636366', lineHeight: 20 },
  offerBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#00C853', paddingVertical: 16, borderRadius: 14 },
  offerBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  priceInput: { flex: 1, fontSize: 22, fontWeight: '700', color: '#1C1C1E', backgroundColor: '#F2F2F7', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  msgInput: { backgroundColor: '#F2F2F7', borderRadius: 12, padding: 14, fontSize: 14, color: '#1C1C1E', minHeight: 60 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#F2F2F7', alignItems: 'center' },
  submitBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#00C853', alignItems: 'center' },
  setupIcon: { width: 80, height: 80, borderRadius: 24, backgroundColor: 'rgba(0,200,83,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  setupTitle: { fontSize: 22, fontWeight: '800', color: '#1C1C1E', textAlign: 'center' },
  setupSubtitle: { fontSize: 15, color: '#8E8E93', textAlign: 'center', marginTop: 8, paddingHorizontal: 40, lineHeight: 22 },
  setupBtn: { backgroundColor: '#00C853', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 14, marginTop: 28 },
  setupBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
