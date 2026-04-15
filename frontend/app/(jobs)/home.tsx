import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  ActivityIndicator, ScrollView, Dimensions, Platform, Alert, Vibration, Image,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiService } from '@/src/services/api';
import { useAuthStore } from '@/src/stores/authStore';
import { socketService } from '@/src/services/socket';

const { width } = Dimensions.get('window');
const GREEN = '#00C853';
const REVIEW_SECONDS = 30;

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
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  const [jobs, setJobs] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [togglingAvail, setTogglingAvail] = useState(false);
  const [myCats, setMyCats] = useState<string[]>([]);

  // Job alert & review states
  const [incomingJob, setIncomingJob] = useState<any>(null);
  const [reviewingJob, setReviewingJob] = useState<any>(null);
  const [reviewTimer, setReviewTimer] = useState(REVIEW_SECONDS);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptedJob, setAcceptedJob] = useState<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [myActiveJobs, setMyActiveJobs] = useState<any[]>([]);

  // ─── Load data ───
  const loadAll = useCallback(async () => {
    try {
      const [catsRes, jobsRes, profileRes] = await Promise.all([
        apiService.get('/jobs/categories'),
        apiService.get('/jobs/posts?status=open'),
        apiService.get('/jobs/professional/profile'),
      ]);
      setCategories(catsRes.categories || []);
      setJobs(jobsRes.jobs || []);
      setHasProfile(profileRes.has_profile);
      if (profileRes.profile) {
        setIsAvailable(profileRes.profile.is_available || false);
        setMyCats(profileRes.profile.categories || []);
      }
      // Load active jobs for this professional
      try {
        const activeRes = await apiService.get('/jobs/my-active');
        setMyActiveJobs(activeRes.jobs || []);
      } catch {}
    } catch (e) { console.log('Jobs load error', e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Reload when screen comes into focus (after setup-profile)
  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  // ─── WebSocket for job notifications ───
  useEffect(() => {
    if (!user?.user_id || !hasProfile) return;

    // Use the shared socketService (same as driver home)
    socketService.connect(user.user_id);

    const unsubNewJob = socketService.on('new_job_available', (msg: any) => {
      if (isAvailable) {
        Vibration.vibrate([0, 300, 100, 300]);
        setIncomingJob(msg);
      }
    });

    return () => { unsubNewJob(); };
  }, [user?.user_id, hasProfile, isAvailable]);

  // ─── Refresh jobs periodically ───
  useEffect(() => {
    const iv = setInterval(() => { if (isAvailable) loadAll(); }, 10000);
    return () => clearInterval(iv);
  }, [isAvailable, loadAll]);

  // ─── Map markers (wait for map ready) ───
  useEffect(() => {
    if (!mapReady || !webViewRef.current || jobs.length === 0) return;
    const filtered = selectedCat ? jobs.filter(j => j.category === selectedCat) : jobs;
    const markersJs = filtered.map(j => {
      const lat = j.location?.latitude || -28.47;
      const lng = j.location?.longitude || -65.78;
      const cat = CAT_ICONS[j.category] || CAT_ICONS.otro;
      return `addJobMarker(${lat}, ${lng}, '${j.job_id}', '${cat.icon}', '${j.title?.replace(/'/g, '')}', ${j.budget || 0}, '${j.category}');`;
    }).join('\n');
    webViewRef.current.injectJavaScript(`clearMarkers(); ${markersJs}; true;`);
  }, [jobs, selectedCat, mapReady]);

  // ─── 30-sec review timer ───
  useEffect(() => {
    if (reviewingJob) {
      setReviewTimer(REVIEW_SECONDS);
      timerRef.current = setInterval(() => {
        setReviewTimer(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            handleDeclineJob();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [reviewingJob?.job_id]);

  // ─── Toggle availability ───
  const toggleAvailability = async () => {
    setTogglingAvail(true);
    try {
      const newVal = !isAvailable;
      await apiService.put('/jobs/professional/profile', { is_available: newVal });
      setIsAvailable(newVal);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo cambiar disponibilidad');
    }
    setTogglingAvail(false);
  };

  // ─── Start reviewing a job (30-sec lock) ───
  const handleReviewJob = async (job: any) => {
    try {
      await apiService.post(`/jobs/${job.job_id}/review`, {});
      setIncomingJob(null);
      // Load full job details
      const res = await apiService.get(`/jobs/detail/${job.job_id}`);
      setReviewingJob(res.job || job);
    } catch (e: any) {
      Alert.alert('No disponible', e.message || 'Este trabajo ya no está disponible');
      setIncomingJob(null);
    }
  };

  // ─── Accept job after review ───
  const handleAcceptJob = async () => {
    if (!reviewingJob) return;
    setAccepting(true);
    try {
      await apiService.post(`/jobs/${reviewingJob.job_id}/accept`, {});
      clearInterval(timerRef.current);
      setAcceptedJob(reviewingJob);
      setReviewingJob(null);
      setSelectedJob(null);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo aceptar');
    }
    setAccepting(false);
  };

  // ─── Decline job ───
  const handleDeclineJob = async () => {
    if (!reviewingJob) return;
    try {
      await apiService.post(`/jobs/${reviewingJob.job_id}/decline`, {});
    } catch {}
    clearInterval(timerRef.current);
    setReviewingJob(null);
  };

  // ─── Map tap handler ───
  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'job_selected') {
        const job = jobs.find(j => j.job_id === data.job_id);
        if (job) setSelectedJob(job);
      }
    } catch {}
  };

  // ─── Start review from map selection ───
  const handleReviewFromMap = async () => {
    if (!selectedJob) return;
    try {
      await apiService.post(`/jobs/${selectedJob.job_id}/review`, {});
      const res = await apiService.get(`/jobs/detail/${selectedJob.job_id}`);
      setSelectedJob(null);
      setReviewingJob(res.job || selectedJob);
    } catch (e: any) {
      Alert.alert('No disponible', e.message || 'Este trabajo ya no está disponible');
    }
  };

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
function addJobMarker(lat,lng,jobId,emoji,title,budget,cat){
  var icon=L.divIcon({
    html:'<div style="width:44px;height:44px;border-radius:14px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 2px 8px rgba(0,0,0,0.15);border:2px solid #00C853">'+emoji+'</div>',
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

  // ─── RENDER ───

  if (loading) return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.center}><ActivityIndicator size="large" color={GREEN} /></View>
    </View>
  );

  if (!hasProfile) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Moli Trabajos</Text>
        </View>
        <View style={s.center}>
          <View style={s.setupIcon}><Ionicons name="briefcase" size={40} color={GREEN} /></View>
          <Text style={s.setupTitle}>Configurá tu perfil profesional</Text>
          <Text style={s.setupSubtitle}>Completá tu perfil para poder ver trabajos disponibles.</Text>
          <TouchableOpacity style={s.setupBtn} onPress={() => router.push('/(jobs)/setup-profile')}>
            <Text style={s.setupBtnText}>Completar perfil</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const filteredJobs = selectedCat ? jobs.filter(j => j.category === selectedCat) : jobs;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header with GO button */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.replace('/modules')} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Moli Trabajos</Text>
        <View style={s.jobCount}>
          <Text style={s.jobCountText}>{filteredJobs.length}</Text>
        </View>

        {/* GO Button */}
        <TouchableOpacity
          style={[s.goBtn, isAvailable && s.goBtnActive]}
          onPress={toggleAvailability}
          disabled={togglingAvail}
        >
          {togglingAvail ? (
            <ActivityIndicator size="small" color={isAvailable ? '#fff' : GREEN} />
          ) : (
            <>
              <Ionicons name={isAvailable ? 'radio-button-on' : 'radio-button-off'} size={16} color={isAvailable ? '#fff' : GREEN} />
              <Text style={[s.goBtnText, isAvailable && { color: '#fff' }]}>
                {isAvailable ? 'EN LÍNEA' : 'OFFLINE'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Professional's active jobs banner */}
      {myActiveJobs.length > 0 && (
        <View style={{ backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E5EA', paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#1C1C1E', marginBottom: 4 }}>Mis trabajos activos</Text>
          {myActiveJobs.map(j => (
            <TouchableOpacity key={j.job_id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', borderRadius: 10, padding: 10, marginBottom: 4, gap: 8 }}
              onPress={() => { setAcceptedJob(j); }}>
              <Ionicons name="briefcase" size={18} color={GREEN} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#1C1C1E' }} numberOfLines={1}>{j.title}</Text>
                <Text style={{ fontSize: 11, color: '#636366' }}>{j.client_name} · ${j.budget}</Text>
              </View>
              <Text style={{ fontSize: 11, fontWeight: '600', color: GREEN }}>{j.status === 'pending_completion' ? 'Finalizando' : 'Activo'}</Text>
              <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* My categories indicator */}
      {myCats.length > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4, backgroundColor: '#F8F8FA', gap: 4 }}>
          <Text style={{ fontSize: 10, color: '#8E8E93', fontWeight: '600' }}>Acepto:</Text>
          {myCats.map(c => (
            <Text key={c} style={{ fontSize: 10, color: GREEN, fontWeight: '700' }}>
              {CAT_ICONS[c]?.icon || '📋'}
            </Text>
          ))}
        </View>
      ) : (
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#FFF3E0', gap: 6 }}
          onPress={() => router.push('/(jobs)/setup-profile')}
        >
          <Ionicons name="warning" size={14} color="#FF9500" />
          <Text style={{ fontSize: 11, color: '#FF9500', fontWeight: '600' }}>Configurá tus categorías para recibir trabajos</Text>
        </TouchableOpacity>
      )}

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
            onLoadEnd={() => setTimeout(() => setMapReady(true), 500)}
            style={{ flex: 1 }}
            javaScriptEnabled
          />
        )}

        {/* Not available overlay */}
        {!isAvailable && (
          <View style={s.offlineOverlay}>
            <Ionicons name="moon" size={28} color="#8E8E93" />
            <Text style={s.offlineText}>Estás offline</Text>
            <Text style={s.offlineSubtext}>Presioná EN LÍNEA para recibir trabajos</Text>
          </View>
        )}
      </View>

      {/* Selected job from map */}
      {selectedJob && !reviewingJob && (
        <View style={[s.sheet, { bottom: 56 + Math.max(insets.bottom, 8) }]}>
          <View style={s.sheetHandle} />
          <TouchableOpacity style={s.sheetClose} onPress={() => setSelectedJob(null)}>
            <Ionicons name="close" size={20} color="#636366" />
          </TouchableOpacity>
          <View style={s.sheetHeader}>
            <Text style={s.sheetEmoji}>{CAT_ICONS[selectedJob.category]?.icon || '📋'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.sheetTitle}>{selectedJob.title}</Text>
              <Text style={s.sheetCat}>{selectedJob.category} · {selectedJob.client_name}</Text>
            </View>
            <Text style={s.sheetBudget}>${selectedJob.budget?.toLocaleString()}</Text>
          </View>
          <Text style={s.sheetDesc} numberOfLines={2}>{selectedJob.description}</Text>
          {selectedJob.address ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
              <Ionicons name="location" size={14} color={GREEN} />
              <Text style={{ fontSize: 13, color: '#636366' }}>{selectedJob.address}</Text>
            </View>
          ) : null}
          <TouchableOpacity style={s.reviewBtn} onPress={handleReviewFromMap}>
            <Ionicons name="eye" size={20} color="#fff" />
            <Text style={s.reviewBtnText}>Revisar trabajo (30s)</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ═══ Bottom navigation bar ═══ */}
      <View style={[s.bottomNav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TouchableOpacity style={s.navBtn} onPress={() => {}}>
          <Ionicons name="map" size={22} color={GREEN} />
          <Text style={[s.navLabel, { color: GREEN }]}>Mapa</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.navBtn} onPress={() => router.push('/(jobs)/pro-profile')}>
          <Ionicons name="person-circle-outline" size={22} color="#8E8E93" />
          <Text style={s.navLabel}>Perfil</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.navBtn} onPress={() => router.push('/(jobs)/setup-profile')}>
          <Ionicons name="settings-outline" size={22} color="#8E8E93" />
          <Text style={s.navLabel}>Categorías</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.navBtn} onPress={() => router.replace('/modules')}>
          <Ionicons name="home-outline" size={22} color="#8E8E93" />
          <Text style={s.navLabel}>Inicio</Text>
        </TouchableOpacity>
      </View>

      {/* ═══ Incoming job alert popup ═══ */}
      <Modal visible={!!incomingJob && !reviewingJob} transparent animationType="slide">
        <View style={s.alertOverlay}>
          <View style={s.alertCard}>
            <View style={s.alertPulse}>
              <Text style={{ fontSize: 36 }}>{CAT_ICONS[incomingJob?.category]?.icon || '📋'}</Text>
            </View>
            <Text style={s.alertTitle}>¡Nuevo trabajo disponible!</Text>
            <Text style={s.alertJobTitle}>{incomingJob?.title}</Text>
            <Text style={s.alertBudget}>${incomingJob?.budget?.toLocaleString()}</Text>
            <Text style={s.alertAddress}>{incomingJob?.address}</Text>
            <Text style={s.alertClient}>Cliente: {incomingJob?.client_name}</Text>

            <TouchableOpacity style={s.alertReviewBtn} onPress={() => handleReviewJob(incomingJob)}>
              <Ionicons name="eye" size={22} color="#fff" />
              <Text style={s.alertReviewBtnText}>Revisar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.alertDismissBtn} onPress={() => setIncomingJob(null)}>
              <Text style={s.alertDismissText}>Ignorar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ═══ 30-second review modal ═══ */}
      <Modal visible={!!reviewingJob} transparent animationType="fade">
        <View style={s.alertOverlay}>
          <View style={s.reviewCard}>
            {/* Timer bar */}
            <View style={s.timerBarBg}>
              <View style={[s.timerBarFill, { width: `${(reviewTimer / REVIEW_SECONDS) * 100}%` }]} />
            </View>
            <View style={s.timerRow}>
              <Ionicons name="timer" size={18} color={reviewTimer <= 10 ? '#FF3B30' : GREEN} />
              <Text style={[s.timerText, reviewTimer <= 10 && { color: '#FF3B30' }]}>{reviewTimer}s</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 40 }}>{CAT_ICONS[reviewingJob?.category]?.icon || '📋'}</Text>
              </View>
              <Text style={s.reviewJobTitle}>{reviewingJob?.title}</Text>
              <Text style={s.reviewJobCat}>{reviewingJob?.category} · {reviewingJob?.client_name}</Text>
              <View style={s.reviewBudgetRow}>
                <Text style={s.reviewBudgetLabel}>Presupuesto</Text>
                <Text style={s.reviewBudgetVal}>${reviewingJob?.budget?.toLocaleString()}</Text>
              </View>
              <Text style={s.reviewDescTitle}>Descripción</Text>
              <Text style={s.reviewDesc}>{reviewingJob?.description}</Text>
              {/* Job images */}
              {reviewingJob?.images?.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <Text style={s.reviewDescTitle}>Fotos del trabajo</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                    {reviewingJob.images.map((img: string, i: number) => (
                      <Image key={i} source={{ uri: img }} style={{ width: 120, height: 90, borderRadius: 10, marginRight: 8 }} resizeMode="cover" />
                    ))}
                  </ScrollView>
                </View>
              )}
              {reviewingJob?.address ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
                  <Ionicons name="location" size={16} color={GREEN} />
                  <Text style={{ fontSize: 14, color: '#636366', flex: 1 }}>{reviewingJob.address}</Text>
                </View>
              ) : null}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <TouchableOpacity style={s.declineBtn} onPress={handleDeclineJob}>
                <Ionicons name="close-circle" size={20} color="#FF3B30" />
                <Text style={s.declineBtnText}>Rechazar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.acceptBtn} onPress={handleAcceptJob} disabled={accepting}>
                {accepting ? <ActivityIndicator color="#fff" size="small" /> : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={s.acceptBtnText}>Aceptar</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══ Accepted job - Active work screen ═══ */}
      <Modal visible={!!acceptedJob} transparent animationType="slide">
        <View style={s.alertOverlay}>
          <View style={[s.reviewCard, { maxHeight: '85%' }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Success header */}
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
                  <Ionicons name="checkmark-circle" size={40} color={GREEN} />
                </View>
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#1C1C1E' }}>¡Trabajo aceptado!</Text>
                <Text style={{ fontSize: 13, color: '#8E8E93', marginTop: 4 }}>Dirigite a la ubicación del cliente</Text>
              </View>

              {/* Job details */}
              <View style={{ backgroundColor: '#F8F8FA', borderRadius: 16, padding: 16, marginBottom: 12 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#1C1C1E' }}>{acceptedJob?.title}</Text>
                <Text style={{ fontSize: 14, color: '#636366', marginTop: 4 }}>{acceptedJob?.description}</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E5E5EA' }}>
                  <View>
                    <Text style={{ fontSize: 12, color: '#8E8E93' }}>Presupuesto</Text>
                    <Text style={{ fontSize: 20, fontWeight: '800', color: GREEN }}>${acceptedJob?.budget?.toLocaleString()}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 12, color: '#8E8E93' }}>Cliente</Text>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: '#1C1C1E' }}>{acceptedJob?.client_name}</Text>
                  </View>
                </View>
              </View>

              {/* Location */}
              {acceptedJob?.address ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8F8FA', borderRadius: 14, padding: 14, marginBottom: 12 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="navigate" size={20} color={GREEN} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, color: '#8E8E93' }}>Dirección</Text>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#1C1C1E' }}>{acceptedJob.address}</Text>
                  </View>
                </View>
              ) : null}

              {/* Images */}
              {acceptedJob?.images?.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#1C1C1E', marginBottom: 6 }}>Fotos</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {acceptedJob.images.map((img: string, i: number) => (
                      <Image key={i} source={{ uri: img }} style={{ width: 140, height: 100, borderRadius: 12, marginRight: 8 }} resizeMode="cover" />
                    ))}
                  </ScrollView>
                </View>
              )}
            </ScrollView>

            {/* Action buttons */}
            <View style={{ gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, paddingVertical: 16, borderRadius: 14 }}
                onPress={() => {
                  if (acceptedJob?.location) {
                    const lat = acceptedJob.location.latitude;
                    const lng = acceptedJob.location.longitude;
                    const url = Platform.select({
                      ios: `maps:0,0?q=${lat},${lng}`,
                      android: `geo:${lat},${lng}?q=${lat},${lng}`,
                      default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
                    });
                    import('react-native').then(({ Linking }) => Linking.openURL(url || ''));
                  }
                }}
              >
                <Ionicons name="navigate" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Abrir navegación</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#007AFF', paddingVertical: 16, borderRadius: 14 }}
                onPress={() => {
                  setAcceptedJob(null);
                  router.push({ pathname: '/chat', params: { rideId: acceptedJob?.job_id, otherName: acceptedJob?.client_name || 'Cliente' } } as any);
                }}
              >
                <Ionicons name="chatbubble" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Chatear con cliente</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ paddingVertical: 12, alignItems: 'center' }}
                onPress={() => { setAcceptedJob(null); loadAll(); }}
              >
                <Text style={{ color: '#8E8E93', fontSize: 14, fontWeight: '600' }}>Volver al mapa</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1C1C1E', flex: 1 },
  jobCount: { backgroundColor: GREEN, width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  jobCountText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  goBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 2, borderColor: GREEN, backgroundColor: '#fff' },
  goBtnActive: { backgroundColor: GREEN },
  goBtnText: { fontSize: 12, fontWeight: '800', color: GREEN },
  catScroll: { maxHeight: 48, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F2F2F7' },
  catChipActive: { backgroundColor: GREEN },
  catChipText: { fontSize: 12, fontWeight: '600', color: '#636366' },
  catChipTextActive: { color: '#fff' },
  offlineOverlay: { position: 'absolute', bottom: 16, left: 16, right: 16, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 16, padding: 20, alignItems: 'center', gap: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 },
  offlineText: { fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  offlineSubtext: { fontSize: 13, color: '#8E8E93' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 10 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D1D6', alignSelf: 'center', marginBottom: 12 },
  sheetClose: { position: 'absolute', top: 16, right: 16, zIndex: 1 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  sheetEmoji: { fontSize: 32 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#1C1C1E' },
  sheetCat: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  sheetBudget: { fontSize: 22, fontWeight: '800', color: GREEN },
  sheetDesc: { fontSize: 14, color: '#636366', lineHeight: 20 },
  reviewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, paddingVertical: 16, borderRadius: 14, marginTop: 14 },
  reviewBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Alert popup
  alertOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  alertCard: { width: '100%', backgroundColor: '#fff', borderRadius: 24, padding: 28, alignItems: 'center' },
  alertPulse: { width: 72, height: 72, borderRadius: 22, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  alertTitle: { fontSize: 20, fontWeight: '800', color: '#1C1C1E', marginBottom: 8 },
  alertJobTitle: { fontSize: 16, fontWeight: '600', color: '#1C1C1E' },
  alertBudget: { fontSize: 28, fontWeight: '800', color: GREEN, marginTop: 4 },
  alertAddress: { fontSize: 13, color: '#8E8E93', marginTop: 6 },
  alertClient: { fontSize: 13, color: '#636366', marginTop: 4 },
  alertReviewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, paddingVertical: 16, borderRadius: 14, width: '100%', marginTop: 20 },
  alertReviewBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  alertDismissBtn: { paddingVertical: 12, marginTop: 8 },
  alertDismissText: { color: '#8E8E93', fontSize: 15, fontWeight: '600' },

  // Review modal
  reviewCard: { width: '100%', backgroundColor: '#fff', borderRadius: 24, padding: 24 },
  timerBarBg: { height: 6, borderRadius: 3, backgroundColor: '#E5E5EA', marginBottom: 8, overflow: 'hidden' },
  timerBarFill: { height: 6, borderRadius: 3, backgroundColor: GREEN },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: 12 },
  timerText: { fontSize: 18, fontWeight: '800', color: GREEN },
  reviewJobTitle: { fontSize: 20, fontWeight: '800', color: '#1C1C1E', textAlign: 'center' },
  reviewJobCat: { fontSize: 14, color: '#8E8E93', textAlign: 'center', marginTop: 4 },
  reviewBudgetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8F8FA', borderRadius: 12, padding: 16, marginTop: 16 },
  reviewBudgetLabel: { fontSize: 14, color: '#636366' },
  reviewBudgetVal: { fontSize: 24, fontWeight: '800', color: GREEN },
  reviewDescTitle: { fontSize: 14, fontWeight: '700', color: '#1C1C1E', marginTop: 16, marginBottom: 4 },
  reviewDesc: { fontSize: 14, color: '#636366', lineHeight: 20 },
  declineBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 16, borderRadius: 14, backgroundColor: '#FFF5F5', borderWidth: 1, borderColor: '#FF3B30' },
  declineBtnText: { color: '#FF3B30', fontSize: 15, fontWeight: '700' },
  acceptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 16, borderRadius: 14, backgroundColor: GREEN },
  acceptBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  setupIcon: { width: 80, height: 80, borderRadius: 24, backgroundColor: 'rgba(0,200,83,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  setupTitle: { fontSize: 22, fontWeight: '800', color: '#1C1C1E', textAlign: 'center' },
  setupSubtitle: { fontSize: 15, color: '#8E8E93', textAlign: 'center', marginTop: 8, paddingHorizontal: 40, lineHeight: 22 },
  setupBtn: { backgroundColor: GREEN, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 14, marginTop: 28 },
  setupBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  bottomNav: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E5EA', paddingVertical: 6, paddingHorizontal: 8 },
  navBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, gap: 2 },
  navLabel: { fontSize: 10, fontWeight: '600', color: '#8E8E93' },
});
