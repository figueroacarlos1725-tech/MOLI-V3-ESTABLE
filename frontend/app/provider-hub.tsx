import { operatorAlert } from '@/src/components/OperatorAlert';
import { WorkingVehiclePicker } from '@/src/components/WorkingVehiclePicker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, AppState, Image, Modal, SafeAreaView, ScrollView, StyleSheet,
  Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useAuthStore } from '@/src/stores/authStore';
import { apiService } from '@/src/services/api';
import { socketService } from '@/src/services/socket';
import { getCurrentLocation, getRealCurrentLocation } from '@/src/utils/location';
import { MapView } from '@/src/components/MapView';
import SideMenu from '@/src/components/SideMenu';

const ORANGE = '#FF5A1F';
const INK = '#17181C';
const WARM = '#FFF9F3';
const DEFAULT_LOCATION = { latitude: -28.4696, longitude: -65.7852 };

type ServiceKey = 'rides' | 'deliveries' | 'paperwork' | 'jobs';
type Opportunity = {
  id: string;
  type: ServiceKey;
  title: string;
  subtitle: string;
  amount?: number;
  raw: any;
};

const ART: Record<ServiceKey, any> = {
  rides: require('../assets/modules/travel.png'),
  deliveries: require('../assets/modules/delivery.png'),
  paperwork: require('../assets/modules/paperwork.png'),
  jobs: require('../assets/professions/verified-tools.png'),
};

const SERVICES: { key: ServiceKey; label: string; copy: string }[] = [
  { key: 'rides', label: 'Viajes', copy: 'Pasajeros cerca' },
  { key: 'deliveries', label: 'Envíos', copy: 'Paquetes y pedidos' },
  { key: 'paperwork', label: 'Trámites', copy: 'Gestiones y documentos' },
  { key: 'jobs', label: 'Trabajos', copy: 'Servicios profesionales' },
];

function money(value = 0) {
  return `$${Math.round(value).toLocaleString('es-AR')}`;
}

export default function ProviderHub() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const driver = user?.user_type === 'driver';
  const professional = Boolean(user?.is_professional);
  const provisionalCapabilities = Object.entries((user as any)?.capability_approvals || {}).filter(([, value]: any) => value?.status === 'provisional');
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [online, setOnline] = useState(false);
  const [busyOnline, setBusyOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [earnings, setEarnings] = useState({ total_earnings: 0, total_rides: 0 });
  const [prefs, setPrefs] = useState<Record<ServiceKey, boolean>>({
    rides: true, deliveries: true, paperwork: true, jobs: true,
  });
  const [radius, setRadius] = useState(10);
  const [jobs, setJobs] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [rideOffer, setRideOffer] = useState<any>(null);
  const [countdown, setCountdown] = useState(25);
  const [reviewingRide, setReviewingRide] = useState(false);
  const [rideNotice, setRideNotice] = useState<any>(null);
  const [opportunityNotice, setOpportunityNotice] = useState('');
  const [jobOffer, setJobOffer] = useState<any>(null);
  const [jobCountdown, setJobCountdown] = useState(35);
  const [reviewingJob, setReviewingJob] = useState(false);
  const [counterPrice, setCounterPrice] = useState('');
  const [activeJob, setActiveJob] = useState<any>(null);
  const [activeRide, setActiveRide] = useState<any>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const allowed = useCallback((key: ServiceKey) =>
    key === 'rides' || key === 'deliveries' ? driver : professional,
  [driver, professional]);

  useEffect(() => {
    let active = true;
    const saved = (user as any)?.location;
    if (Number.isFinite(saved?.latitude) && Number.isFinite(saved?.longitude)) setLocation(saved);
    const timer = setTimeout(() => { active = false; }, 5000);
    getCurrentLocation().then(current => { if (active && current) setLocation(current); }).catch(() => {}).finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); };
  }, [user?.user_id]);

  useEffect(() => {
    if (!professional || !online || !isFocused || !user?.user_id) return;
    let active = true, sending = false;
    const report = async () => {
      if (!active || sending || AppState.currentState !== 'active') return;
      sending = true;
      try {
        const current = await getRealCurrentLocation();
        if (!active || !current || AppState.currentState !== 'active') return;
        setLocation(current);
        await apiService.put('/jobs/professional/profile', { location: current });
      } catch { /* Failed GPS/reporting is not replaced with a made-up coordinate. */ }
      finally { sending = false; }
    };
    report();
    const timer = setInterval(report, 10000);
    return () => { active = false; clearInterval(timer); };
  }, [professional, online, isFocused, user?.user_id]);

  const loadDashboard = useCallback(async () => {
    const results = await Promise.allSettled([
      driver ? apiService.get('/drivers/earnings?period=today') : Promise.resolve(null),
      professional ? apiService.get('/jobs/professional/profile') : Promise.resolve(null),
      professional ? apiService.get('/jobs/posts?status=open') : Promise.resolve({ jobs: [] }),
      driver ? apiService.get('/marketplace/deliveries/driver/inbox') : Promise.resolve({ deliveries: [] }),
      professional ? apiService.get('/jobs/my-active') : Promise.resolve({ jobs: [] }),
      driver ? apiService.get('/rides/active') : Promise.resolve({ ride: null }),
    ]);
    const [earningResult, profileResult, jobsResult, deliveriesResult, activeResult, rideResult] = results;
    if (earningResult.status === 'fulfilled' && earningResult.value) setEarnings(earningResult.value);
    if (profileResult.status === 'fulfilled' && profileResult.value?.profile) {
      const profile = profileResult.value.profile;
      const accepted: string[] = profile.accepted_services || [];
      setPrefs(old => ({
        ...old,
        rides: accepted.length ? accepted.includes('rides') : old.rides,
        deliveries: accepted.length ? accepted.includes('deliveries') : old.deliveries,
        paperwork: accepted.length ? accepted.includes('paperwork') : old.paperwork,
        jobs: accepted.length ? accepted.includes('jobs') : old.jobs,
      }));
      setRadius(profile.work_radius_km || 10);
      setOnline(Boolean(profile.is_available));
    }
    if (jobsResult.status === 'fulfilled') setJobs(jobsResult.value?.jobs || []);
    if (deliveriesResult.status === 'fulfilled') setDeliveries(deliveriesResult.value?.deliveries || []);
    if (activeResult.status === 'fulfilled') setActiveJob(activeResult.value?.jobs?.[0] || null);
    if (rideResult.status === 'fulfilled') {
      const ride = rideResult.value?.ride;
      setActiveRide(ride && ['accepted', 'arrived', 'started'].includes(ride.status) ? ride : null);
    }
    setLoading(false);
  }, [driver, professional]);

  useFocusEffect(useCallback(() => { loadDashboard(); }, [loadDashboard]));
  useEffect(() => {
    if (!isFocused || (!online && !activeJob?.job_id && !activeRide?.ride_id)) return;
    const timer = setInterval(loadDashboard, 8000);
    return () => clearInterval(timer);
  }, [activeJob?.job_id, activeRide?.ride_id, online, isFocused, loadDashboard]);

  useEffect(() => {
    if (!user?.user_id || !isFocused) return;
    socketService.connect(user.user_id);
    const unsubscribeOffer = socketService.on('ride_offer', (offer: any) => {
      if (!prefs.rides || !online) return;
      setRideOffer(offer);
      setCountdown(offer.countdown || 25);
      setReviewingRide(false);
    });
    const unsubscribeExpired = socketService.on('ride_offer_expired', () => setRideOffer(null));
    const unsubscribeReview = socketService.on('ride_under_review', (notice: any) => {
      setRideOffer(null);
      setRideNotice({ kind: 'review', ...notice });
    });
    const unsubscribeTaken = socketService.on('ride_opportunity_taken', (notice: any) => {
      setRideOffer(null);
      setRideNotice({ kind: 'taken', ...notice });
      setTimeout(() => setRideNotice(null), 3200);
    });
    const unsubscribeJob = socketService.on('new_job_available', (job: any) => {
      const isPaperwork = job?.category === 'tramites';
      if (online && (isPaperwork ? prefs.paperwork : prefs.jobs)) {
        setJobOffer(job);
        setJobCountdown(35);
        setReviewingJob(false);
      }
      loadDashboard();
    });
    const withdrawJob = (notice: any) => {
      setJobOffer((offer: any) => offer?.job_id === notice.job_id ? null : offer);
      setJobs(items => items.filter(item => item.job_id !== notice.job_id));
      setOpportunityNotice(notice.message || 'Esta solicitud ya está siendo atendida por otro profesional.');
      loadDashboard();
    };
    const unsubscribeJobReview = socketService.on('job_under_review', withdrawJob);
    const unsubscribeJobTaken = socketService.on('job_opportunity_taken', withdrawJob);
    const unsubscribeDeliveryTaken = socketService.on('delivery_opportunity_taken', (notice: any) => {
      setDeliveries(items => items.filter(item => item.delivery_id !== notice.delivery_id));
      setOpportunityNotice(notice.message || 'Otro repartidor aceptó esta entrega.');
      loadDashboard();
    });
    return () => { unsubscribeOffer(); unsubscribeExpired(); unsubscribeReview(); unsubscribeTaken(); unsubscribeJob(); unsubscribeJobReview(); unsubscribeJobTaken(); unsubscribeDeliveryTaken(); };
  }, [user?.user_id, isFocused, prefs.rides, prefs.jobs, prefs.paperwork, online, loadDashboard]);

  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (!rideOffer) return;
    countdownRef.current = setInterval(() => setCountdown(value => {
      if (value <= 1) {
        setRideOffer(null);
        return 0;
      }
      return value - 1;
    }), 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [rideOffer?.request_id]);

  useEffect(() => {
    if (!jobOffer) return;
    const timer = setInterval(() => setJobCountdown(value => {
      if (value <= 1) { setJobOffer(null); return 0; }
      return value - 1;
    }), 1000);
    return () => clearInterval(timer);
  }, [jobOffer?.job_id]);

  const saveProfilePrefs = async (next: Record<ServiceKey, boolean>, nextOnline = online) => {
    if (!professional) return;
    await apiService.put('/jobs/professional/profile', {
      accepted_services: Object.keys(next).filter(key => next[key as ServiceKey]),
      work_radius_km: radius,
      is_available: nextOnline,
      name: user?.name,
    });
  };

  const toggleService = async (key: ServiceKey) => {
    if (!allowed(key)) {
      if (key === 'jobs' || key === 'paperwork') router.push('/(jobs)/setup-profile');
      return;
    }
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    try { await saveProfilePrefs(next); }
    catch { setPrefs(prefs); operatorAlert('No se pudo guardar', 'Intentá nuevamente.'); }
  };

  const toggleOnline = async (value: boolean) => {
    setBusyOnline(true);
    try {
      if (driver) {
        const realLocation=value?await getRealCurrentLocation():null;
        if(realLocation)setLocation(realLocation);
        await apiService.put(`/drivers/availability?is_online=${value}${realLocation?`&latitude=${realLocation.latitude}&longitude=${realLocation.longitude}`:''}`);
      }
      await saveProfilePrefs(prefs, value);
      setOnline(value);
    } catch (error: any) {
      operatorAlert('No pudimos cambiar tu estado', error?.message || 'Revisá tu perfil y documentación.');
    } finally { setBusyOnline(false); }
  };

  const opportunities = useMemo<Opportunity[]>(() => {
    const workItems = jobs
      .filter(job => (job.status === 'open' || job.status === 'reviewing' && job.reviewing_by === user?.user_id) && (job.category === 'tramites' ? prefs.paperwork : prefs.jobs))
      .map(job => ({
        id: job.job_id,
        type: job.category === 'tramites' ? 'paperwork' as const : 'jobs' as const,
        title: job.title || (job.category === 'tramites' ? 'Nuevo trámite' : 'Nuevo trabajo'),
        subtitle: `${job.category || 'Servicio'} · ${job.distance_km ? `${job.distance_km} km` : 'Zona aproximada'}`,
        amount: job.budget,
        raw: job,
      }));
    const deliveryItems = deliveries.filter(() => prefs.deliveries).map(item => ({
      id: item.delivery_id,
      type: 'deliveries' as const,
      title: item.merchant?.name ? `Pedido de ${item.merchant.name}` : 'Nueva entrega',
      subtitle: item.status === 'offering' ? 'Oferta disponible' : 'Entrega en curso',
      amount: (item.pricing?.delivery_fee_cents || 0) / 100,
      raw: item,
    }));
    return [...deliveryItems, ...workItems];
  }, [user?.user_id, jobs, deliveries, prefs]);

  const mapMarkers = useMemo(() => {
    const points: any[] = [{ ...location, type: 'user', title: 'Tu ubicación' }];
    opportunities.slice(0, 8).forEach((item, index) => {
      const exact = item.raw.location;
      const angle = (index / Math.max(opportunities.length, 1)) * Math.PI * 2;
      points.push({
        latitude: exact?.latitude || location.latitude + Math.cos(angle) * (0.008 + index * 0.001),
        longitude: exact?.longitude || location.longitude + Math.sin(angle) * (0.008 + index * 0.001),
        type: item.type === 'deliveries' ? 'pickup' : 'driver',
        vehicleType: item.type === 'deliveries' ? 'moto' : 'economy',
        title: exact ? item.title : 'Zona aproximada',
      });
    });
    return points;
  }, [location, opportunities]);

  const respondRide = async (action: 'accept' | 'reject') => {
    if (!rideOffer) return;
    try {
      const response = await apiService.post(`/rides/${rideOffer.request_id}/driver-response?action=${action}`);
      setRideOffer(null);
      if (action === 'accept' && response.status === 'accepted') router.push('/(driver)/home');
    } catch (error: any) { operatorAlert('Oferta no disponible', error?.message || 'La oferta venció.'); }
  };

  const reviewRide = async () => {
    if (!rideOffer) return;
    try {
      await apiService.post(`/rides/request/${rideOffer.request_id}/review`, {});
      setReviewingRide(true);
      setCountdown(35);
    } catch (error: any) {
      setRideOffer(null);
      setRideNotice({ kind: 'review', message: error?.message || 'Otro conductor está revisando esta oportunidad' });
    }
  };

  const openOpportunity = async (item: Opportunity) => {
    if (item.type === 'deliveries') {
      router.push('/(driver)/deliveries');
      return;
    }
    try {
      await apiService.post(`/jobs/${item.id}/review`, {});
      const detail = await apiService.get(`/jobs/detail/${item.id}`);
      setJobOffer(detail.job || item.raw);
      setReviewingJob(true);
      setJobCountdown(35);
    } catch (error: any) { operatorAlert('Oportunidad no disponible', error?.message || 'Otra persona comenzó a revisarla.'); }
  };

  const reviewIncomingJob = async () => {
    if (!jobOffer?.job_id) return;
    try {
      await apiService.post(`/jobs/${jobOffer.job_id}/review`, {});
      const detail = await apiService.get(`/jobs/detail/${jobOffer.job_id}`);
      setJobOffer(detail.job || jobOffer);
      setReviewingJob(true);
      setJobCountdown(35);
    } catch (error: any) { setJobOffer(null); operatorAlert('Oportunidad no disponible', error?.message || 'Ya fue tomada.'); }
  };

  const acceptJob = async () => {
    if (!jobOffer?.job_id) return;
    try {
      await apiService.post(`/jobs/${jobOffer.job_id}/accept`, {});
      const detail = await apiService.get(`/jobs/detail/${jobOffer.job_id}`);
      setActiveJob(detail.job || jobOffer);
      setJobOffer(null);
    } catch (error: any) { operatorAlert('No se pudo aceptar', error?.message || 'La oportunidad venció.'); }
  };

  const rejectJob = async () => {
    if (reviewingJob && jobOffer?.job_id) await apiService.post(`/jobs/${jobOffer.job_id}/decline`, {}).catch(() => {});
    setJobOffer(null);
  };

  const counterJob = async () => {
    const price = Number(counterPrice);
    if (!jobOffer?.job_id || price <= 0) return operatorAlert('Ingresá un importe válido');
    try {
      await apiService.post(`/jobs/${jobOffer.job_id}/counter-offer`, { price });
      setJobOffer(null);
      setCounterPrice('');
      operatorAlert('Propuesta enviada', 'El cliente tiene 35 segundos para responder.');
    } catch (error: any) { operatorAlert('No se pudo enviar', error?.message || 'Intentá nuevamente.'); }
  };

  if (isLoading) return null;
  if (!isAuthenticated) return <Redirect href="/(auth)/welcome" />;
  if (!driver && !professional) return <Redirect href="/modules" />;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.roundButton} onPress={() => setMenuOpen(true)}>
            <Ionicons name="menu" size={25} color={INK} />
          </TouchableOpacity>
          <Text style={styles.logo}>Moli</Text>
          <TouchableOpacity style={styles.roundButton} onPress={() => router.push('/(driver)/inbox')}>
            <Ionicons name="notifications-outline" size={23} color={INK} />
          </TouchableOpacity>
        </View>

        {!!opportunityNotice && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar aviso de oportunidad" onPress={() => setOpportunityNotice('')} style={{backgroundColor:'#FFF1E8',padding:12,borderRadius:12,flexDirection:'row',gap:8}}><Ionicons name="information-circle-outline" size={20} color={ORANGE}/><Text style={{flex:1,color:INK}}>{opportunityNotice}</Text><Ionicons name="close" size={18} color={INK}/></TouchableOpacity>}
        {activeRide && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Continuar viaje activo" onPress={() => router.push('/(driver)/home')} style={[styles.earningsCard, {backgroundColor:'#FFF1E8', borderWidth:1, borderColor:ORANGE}]}>
          <View style={{flex:1}}><Text style={styles.sectionTitle}>Tenés un viaje en curso</Text><Text style={styles.sectionCopy}>Retomá el seguimiento y completá el viaje.</Text></View><Ionicons name="chevron-forward" size={24} color={ORANGE}/>
        </TouchableOpacity>}
        <View style={styles.earningsCard}>
          <View>
            <Text style={styles.eyebrow}>GANANCIAS DE HOY</Text>
            <Text style={styles.earnings}>{money(earnings.total_earnings)}</Text>
            <Text style={styles.earningsCopy}>{earnings.total_rides} servicios completados</Text>
          </View>
          <TouchableOpacity style={styles.statsButton} onPress={() => router.push('/(driver)/earnings')}>
            <Ionicons name="stats-chart" size={19} color={ORANGE} />
            <Text style={styles.statsText}>Estadísticas</Text>
          </TouchableOpacity>
        </View>
        {provisionalCapabilities.length ? <View style={styles.provisionalBanner}><View style={styles.provisionalIcon}><Ionicons name="shield-half" size={23} color={ORANGE}/></View><View style={{flex:1}}><Text style={styles.provisionalTitle}>Capacidades pendientes de aprobación</Text><Text style={styles.provisionalCopy}>Podés trabajar provisoriamente hasta 24 horas mientras Administración revisa tu documentación.</Text></View><Ionicons name="chevron-forward" size={20} color={ORANGE}/></View> : null}

        {driver && <WorkingVehiclePicker online={online}/> }
        <View style={styles.statusRow}>
          <View>
            <Text style={styles.statusLabel}>TU ESTADO</Text>
            <View style={styles.onlineRow}><View style={[styles.statusDot, !online && styles.offDot]} /><Text style={styles.onlineText}>{online ? 'En línea' : 'Desconectado'}</Text></View>
          </View>
          {busyOnline ? <ActivityIndicator color={ORANGE} /> : <Switch value={online} onValueChange={toggleOnline} trackColor={{ false: '#D8D8D8', true: '#68D37C' }} />}
        </View>

        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionTitle}>¿Qué querés recibir?</Text><Text style={styles.sectionCopy}>Activá o pausá cada tipo de solicitud</Text></View>
          <TouchableOpacity onPress={() => setSettingsOpen(true)} style={styles.optionsButton}><Ionicons name="options" size={20} color={ORANGE} /></TouchableOpacity>
        </View>
        <View style={styles.services}>
          {SERVICES.map(service => {
            const enabled = allowed(service.key) && prefs[service.key];
            return <View key={service.key} style={[styles.serviceCard, enabled && styles.serviceActive]}>
              <Image source={ART[service.key]} style={styles.serviceArt} />
              <Text style={styles.serviceName}>{service.label}</Text>
              <TouchableOpacity onPress={() => toggleService(service.key)} accessibilityRole="switch" accessibilityState={{ checked: enabled }} style={[styles.miniSwitch, enabled && styles.miniSwitchOn]}>
                <View style={[styles.miniThumb, enabled && styles.miniThumbOn]} />
              </TouchableOpacity>
            </View>;
          })}
        </View>

        <View style={styles.mapShell}>
          <MapView initialRegion={{ ...location, latitudeDelta: 0.04, longitudeDelta: 0.04 }} markers={mapMarkers} style={styles.map} />
          <View style={styles.mapTopBadge}><View style={styles.pulseDot} /><Text style={styles.mapBadgeText}>{online ? 'Buscando oportunidades' : 'Conectate para comenzar'}</Text></View>
          <TouchableOpacity style={styles.locateButton} onPress={async () => setLocation((await getCurrentLocation()) || DEFAULT_LOCATION)}><Ionicons name="navigate" size={20} color={ORANGE} /></TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Oportunidades para vos</Text>
          <View style={styles.newBadge}><Text style={styles.newBadgeText}>{opportunities.length} CERCA</Text></View>
        </View>
        {loading ? <ActivityIndicator color={ORANGE} style={{ margin: 28 }} /> : opportunities.length === 0 ? (
          <View style={styles.empty}><Ionicons name="radio-outline" size={31} color={ORANGE} /><Text style={styles.emptyTitle}>Todo listo para recibir solicitudes</Text><Text style={styles.emptyCopy}>{online ? 'Las nuevas oportunidades aparecerán acá y en el mapa.' : 'Ponete en línea cuando quieras comenzar.'}</Text></View>
        ) : opportunities.map(item => <OpportunityCard key={`${item.type}-${item.id}`} item={item} onPress={() => openOpportunity(item)} />)}
      </ScrollView>

      {isFocused && <><SideMenu visible={menuOpen} onClose={() => setMenuOpen(false)} role="driver" />
      <Preferences visible={settingsOpen} onClose={() => setSettingsOpen(false)} onDone={async () => { try { await saveProfilePrefs(prefs); } finally { setSettingsOpen(false); } }} prefs={prefs} allowed={allowed} toggle={toggleService} radius={radius} setRadius={setRadius} />
      <RideOffer offer={rideOffer} countdown={countdown} reviewing={reviewingRide} onReview={reviewRide} onAccept={() => respondRide('accept')} onReject={() => reviewingRide ? respondRide('reject') : setRideOffer(null)} />
      <RideNotice notice={rideNotice} onClose={() => setRideNotice(null)} />
      <JobOffer offer={jobOffer} countdown={jobCountdown} reviewing={reviewingJob} counterPrice={counterPrice} setCounterPrice={setCounterPrice} onCounter={counterJob} onReview={reviewIncomingJob} onAccept={acceptJob} onReject={rejectJob} />
      <ActiveJob job={activeJob} location={location} onClose={() => setActiveJob(null)} onRefresh={loadDashboard} /></>}
    </SafeAreaView>
  );
}

function OpportunityCard({ item, onPress }: { item: Opportunity; onPress: () => void }) {
  return <TouchableOpacity style={styles.opportunity} onPress={onPress}>
    <View style={styles.opportunityArt}><Image source={ART[item.type]} style={styles.oppImage} /></View>
    <View style={{ flex: 1 }}><Text style={styles.kind}>{item.type === 'paperwork' ? 'TRÁMITE' : item.type === 'deliveries' ? 'ENVÍO' : 'TRABAJO'}</Text><Text style={styles.oppTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.oppCopy}>{item.subtitle}</Text></View>
    <View style={{ alignItems: 'flex-end' }}>{item.amount ? <Text style={styles.price}>{money(item.amount)}</Text> : null}<Ionicons name="chevron-forward" size={19} color={ORANGE} /></View>
  </TouchableOpacity>;
}

function Preferences({ visible, onClose, onDone, prefs, allowed, toggle, radius, setRadius }: any) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.overlay}><View style={styles.sheet}>
    <View style={styles.handle} /><View style={styles.sheetHead}><View><Text style={styles.sheetTitle}>Tus oportunidades</Text><Text style={styles.sheetCopy}>Los cambios se guardan automáticamente</Text></View><TouchableOpacity onPress={onClose}><Ionicons name="close" size={27} color={INK} /></TouchableOpacity></View>
    {SERVICES.map(service => <View key={service.key} style={styles.prefRow}><Image source={ART[service.key]} style={styles.prefArt} /><View style={{ flex: 1 }}><Text style={styles.prefTitle}>{service.label}</Text><Text style={styles.prefCopy}>{allowed(service.key) ? service.copy : 'Completá el perfil para activarlo'}</Text></View><Switch value={allowed(service.key) && prefs[service.key]} onValueChange={() => toggle(service.key)} trackColor={{ false: '#DDD', true: '#68D37C' }} /></View>)}
    <Text style={styles.radiusTitle}>Radio de trabajo</Text><View style={styles.radiusRow}>{[5, 10, 15, 20].map(value => <TouchableOpacity key={value} onPress={() => setRadius(value)} style={[styles.radius, radius === value && styles.radiusActive]}><Text style={[styles.radiusText, radius === value && styles.radiusTextActive]}>{value} km</Text></TouchableOpacity>)}</View>
    <TouchableOpacity style={styles.doneButton} onPress={onDone}><Text style={styles.doneText}>Guardar preferencias</Text></TouchableOpacity>
  </View></View></Modal>;
}

function RideOffer({ offer, countdown, reviewing, onReview, onAccept, onReject }: any) {
  return <Modal visible={Boolean(offer)} transparent animationType="fade"><View style={styles.offerOverlay}><View style={styles.offerCard}>
    <View style={styles.offerTimer}><Text style={styles.offerSeconds}>{countdown}</Text><Text style={styles.offerSecLabel}>seg</Text></View>
    <Text style={styles.offerEyebrow}>{reviewing ? 'LA ESTÁS REVISANDO' : 'NUEVA OPORTUNIDAD'}</Text><Text style={styles.offerTitle}>{offer?.service_type === 'delivery' ? 'Nuevo envío' : 'Nuevo viaje'}</Text>
    <Text style={styles.offerRoute}>{offer?.pickup_address || 'Punto de retiro'}</Text><Ionicons name="arrow-down" size={18} color={ORANGE} /><Text style={styles.offerRoute}>{offer?.destination_address || 'Destino'}</Text>
    <Text style={styles.offerPrice}>{money(offer?.fare || offer?.estimated_fare || 0)}</Text>
    <View style={styles.privacyPill}><Ionicons name="shield-checkmark" size={15} color={ORANGE} /><Text style={styles.privacyText}>{reviewing ? 'La dirección exacta se libera al aceptar' : 'Zona aproximada · tocá Revisar para bloquearla 35 seg'}</Text></View>
    <View style={styles.offerActions}><TouchableOpacity style={styles.reject} onPress={onReject}><Text style={styles.rejectText}>{reviewing ? 'Rechazar' : 'Omitir'}</Text></TouchableOpacity><TouchableOpacity style={styles.accept} onPress={reviewing ? onAccept : onReview}><Text style={styles.acceptText}>{reviewing ? 'Aceptar' : 'Revisar'}</Text></TouchableOpacity></View>
  </View></View></Modal>;
}

function RideNotice({ notice, onClose }: any) {
  return <Modal visible={Boolean(notice)} transparent animationType="fade"><View style={styles.offerOverlay}><View style={styles.offerCard}>
    <Image source={ART.rides} style={{ width: 110, height: 82, resizeMode: 'contain' }} />
    <View style={[styles.offerTimer, { backgroundColor: notice?.kind === 'taken' ? '#25262B' : ORANGE }]}><Ionicons name={notice?.kind === 'taken' ? 'flag' : 'eye'} size={27} color="#FFF" /></View>
    <Text style={styles.offerEyebrow}>{notice?.kind === 'taken' ? 'OPORTUNIDAD ASIGNADA' : 'EN REVISIÓN'}</Text>
    <Text style={styles.offerTitle}>{notice?.kind === 'taken' ? 'Otro conductor tomó el viaje' : `${notice?.driver_name || 'Otro conductor'} la está revisando`}</Text>
    <Text style={[styles.offerRoute, { textAlign: 'center' }]}>{notice?.kind === 'taken' ? 'Todo bien. Seguimos buscando nuevas oportunidades para vos.' : 'Si no la acepta en 35 segundos, vuelve a quedar disponible.'}</Text>
    <TouchableOpacity style={[styles.accept, { width: '100%', marginTop: 18 }]} onPress={onClose}><Text style={styles.acceptText}>Volver al mapa</Text></TouchableOpacity>
  </View></View></Modal>;
}

function JobOffer({ offer, countdown, reviewing, counterPrice, setCounterPrice, onCounter, onReview, onAccept, onReject }: any) {
  return <Modal visible={Boolean(offer)} transparent animationType="fade"><View style={styles.offerOverlay}><View style={styles.offerCard}>
    <View style={styles.offerTimer}><Text style={styles.offerSeconds}>{countdown}</Text><Text style={styles.offerSecLabel}>seg</Text></View>
    <Text style={styles.offerEyebrow}>{offer?.category === 'tramites' ? 'NUEVO TRÁMITE' : 'TRABAJO PROFESIONAL'}</Text>
    <Image source={offer?.category === 'tramites' ? ART.paperwork : ART.jobs} style={{ width: 76, height: 70, resizeMode: 'contain', marginTop: 7 }} />
    <Text style={styles.offerTitle}>{offer?.title || 'Nueva oportunidad'}</Text>
    <View style={styles.privacyPill}><Ionicons name="shield-checkmark" size={15} color={ORANGE} /><Text style={styles.privacyText}>{reviewing ? 'Dirección disponible al aceptar' : 'Zona aproximada · revisá para continuar'}</Text></View>
    <View style={styles.jobFacts}><View><Text style={styles.factLabel}>PRESUPUESTO</Text><Text style={styles.factValue}>{money(offer?.budget || 0)}</Text></View><View><Text style={styles.factLabel}>PAGO</Text><Text style={styles.factValue}>{offer?.payment_method || 'A coordinar'}</Text></View></View>
    {reviewing ? <View style={styles.counterInputRow}><Text style={styles.currency}>$</Text><TextInput value={counterPrice} onChangeText={(text) => setCounterPrice(text.replace(/[^0-9]/g, ''))} keyboardType="numeric" placeholder={String(offer?.budget || 15000)} style={styles.counterInput} /></View> : null}
    <View style={styles.offerActions}><TouchableOpacity style={styles.reject} onPress={onReject}><Text style={styles.rejectText}>Rechazar</Text></TouchableOpacity>{reviewing ? <><TouchableOpacity style={styles.counter} onPress={onCounter}><Text style={styles.counterText}>Contraofertar</Text></TouchableOpacity><TouchableOpacity style={styles.accept} onPress={onAccept}><Text style={styles.acceptText}>Aceptar</Text></TouchableOpacity></> : <TouchableOpacity style={styles.accept} onPress={onReview}><Text style={styles.acceptText}>Revisar</Text></TouchableOpacity>}</View>
  </View></View></Modal>;
}

function ActiveJob({ job, location, onClose, onRefresh }: any) {
  const router = useRouter();
  const { user } = useAuthStore();
  const attachments = job?.assigned_to === user?.user_id && ['assigned', 'in_progress', 'pending_completion', 'completed'].includes(job?.status) ? (job.attachments || []) : [];
  const [busy, setBusy] = useState(false);
  const destination = job?.location || location;
  const next = job?.status === 'assigned' ? { status: 'in_progress', label: 'Llegué al lugar' } : job?.status === 'in_progress' ? { status: 'mark_completed', label: 'Marcar como finalizado' } : null;
  const advance = async () => {
    if (!next) return;
    setBusy(true);
    try { await apiService.put(`/jobs/${job.job_id}/status`, { status: next.status }); await onRefresh(); }
    catch (error: any) { operatorAlert('No se pudo actualizar', error?.message || 'Intentá nuevamente.'); }
    finally { setBusy(false); }
  };
  const cancel = () => operatorAlert('Cancelar servicio', 'Al cancelar un servicio aceptado puede aplicarse una multa del 10%.', [
    { text: 'Volver', style: 'cancel' },
    { text: 'Cancelar servicio', style: 'destructive', onPress: async () => { await apiService.put(`/jobs/${job.job_id}/status`, { status: 'cancelled' }); onClose(); await onRefresh(); } },
  ]);
  if (!job) return null;
  const step = job.status === 'assigned' ? 1 : job.status === 'in_progress' ? 2 : 3;
  return <Modal visible animationType="slide"><SafeAreaView style={styles.activeSafe}>
    <View style={styles.activeTop}><TouchableOpacity style={styles.roundButton} onPress={onClose}><Ionicons name="arrow-back" size={23} color={INK} /></TouchableOpacity><Text style={styles.activeTopTitle}>Servicio en curso</Text><View style={{ width: 46 }} /></View>
    <View style={styles.activeMap}><MapView initialRegion={{ ...destination, latitudeDelta: .025, longitudeDelta: .025 }} markers={[{ ...location, type: 'user', title: 'Tu ubicación' }, { ...destination, type: 'dropoff', title: 'Destino' }]} showRoute style={{ flex: 1 }} /></View>
    <ScrollView style={styles.activeSheet} contentContainerStyle={{ padding: 18 }}>
      <View style={styles.clientRow}><View style={styles.clientAvatar}><Ionicons name="person" size={27} color="#FFF" /></View><View style={{ flex: 1 }}><Text style={styles.clientName}>{job.client_name || 'Cliente'}</Text><Text style={styles.clientRating}>Cliente del servicio</Text></View><TouchableOpacity style={styles.contactButton} onPress={() => { onClose(); router.push({ pathname: '/chat', params: { jobId: job.job_id, otherName: job.client_name || 'Cliente' } }); }}><Ionicons name="chatbubble" size={20} color={INK} /></TouchableOpacity></View>
      <View style={styles.activeTitleRow}><View style={{ flex: 1 }}><Text style={styles.activeTitle}>{job.status === 'assigned' ? 'Yendo al domicilio' : job.status === 'in_progress' ? 'Trabajo en curso' : 'Esperando confirmación'}</Text><Text style={styles.activeSubtitle}>{job.title} · {job.address || 'Dirección confirmada'}</Text></View><View style={styles.gainPill}><Text style={styles.gainLabel}>Precio acordado</Text><Text style={styles.gainValue}>{money(job.agreed_price ?? job.budget ?? 0)}</Text></View></View>
      {attachments.length > 0 && <View style={{gap: 12, marginVertical: 16}}><Text style={styles.activeTitle}>Archivos del servicio</Text>{attachments.map((attachment: any, index: number) => <View key={index}><Text style={styles.activeSubtitle}>{attachment.name || 'Adjunto'}</Text>{attachment.kind === 'image' && /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(attachment.uri || '') && attachment.uri.length <= 3000000 ? <Image source={{uri: attachment.uri}} style={{width: '100%', height: 200, marginTop: 8, borderRadius: 12}} resizeMode="contain" accessibilityLabel={attachment.name || 'Imagen adjunta'} /> : <Text style={styles.activeSubtitle}>Vista previa no disponible. Consultá al cliente por chat.</Text>}</View>)}</View>}
      <View style={styles.steps}>{['Aceptado', 'En camino', 'Llegué', 'Finalizado'].map((label, index) => <View key={label} style={styles.step}><View style={[styles.stepDot, index <= step && styles.stepDone]}>{index <= step ? <Ionicons name="checkmark" size={13} color="#FFF" /> : null}</View><Text style={[styles.stepText, index <= step && styles.stepTextDone]}>{label}</Text></View>)}</View>
      {next ? <TouchableOpacity style={styles.activePrimary} disabled={busy} onPress={advance}>{busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.activePrimaryText}>{next.label}</Text>}</TouchableOpacity> : null}
      <TouchableOpacity onPress={cancel}><Text style={styles.cancelLink}>Cancelar servicio</Text></TouchableOpacity>
    </ScrollView>
  </SafeAreaView></Modal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: WARM }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16, paddingBottom: 42 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, roundButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: '#4F2A16', shadowOpacity: .1, shadowRadius: 9 }, logo: { fontSize: 32, fontWeight: '900', fontStyle: 'italic', color: ORANGE },
  earningsCard: { marginTop: 16, padding: 19, borderRadius: 25, backgroundColor: INK, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, eyebrow: { color: '#FFB18D', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 }, earnings: { color: '#FFF', fontSize: 32, fontWeight: '900', marginTop: 4 }, earningsCopy: { color: '#AEB0B5', fontSize: 11, marginTop: 2 }, statsButton: { backgroundColor: '#FFF', borderRadius: 16, paddingHorizontal: 13, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 7 }, statsText: { fontSize: 11, fontWeight: '900', color: INK },
  provisionalBanner: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderRadius: 19, backgroundColor: '#FFF2E9', borderWidth: 1, borderColor: '#FFD4BE' }, provisionalIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' }, provisionalTitle: { fontSize: 13, fontWeight: '900', color: INK }, provisionalCopy: { fontSize: 11, lineHeight: 16, color: '#75513F', marginTop: 2 },
  statusRow: { marginTop: 11, backgroundColor: '#FFF', padding: 15, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#F0E4DA' }, statusLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2, color: '#8B8B8B' }, onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 }, statusDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#2FC557' }, offDot: { backgroundColor: '#AAA' }, onlineText: { color: INK, fontSize: 17, fontWeight: '900' },
  sectionHeader: { marginTop: 21, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, sectionTitle: { color: INK, fontSize: 18, fontWeight: '900' }, sectionCopy: { color: '#858585', fontSize: 10, marginTop: 2 }, optionsButton: { width: 39, height: 39, borderRadius: 14, backgroundColor: '#FFF0E8', alignItems: 'center', justifyContent: 'center' },
  services: { flexDirection: 'row', gap: 7 }, serviceCard: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 18, backgroundColor: '#FFF', opacity: .58, borderWidth: 1.5, borderColor: '#EEE7E0' }, serviceActive: { opacity: 1, borderColor: '#FFD0BB', backgroundColor: '#FFFCFA' }, serviceArt: { width: 48, height: 43, resizeMode: 'contain' }, serviceName: { color: INK, fontSize: 10, fontWeight: '900', marginVertical: 5 }, miniSwitch: { width: 31, height: 18, padding: 2, borderRadius: 10, backgroundColor: '#D4D4D4' }, miniSwitchOn: { backgroundColor: '#39BC58' }, miniThumb: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#FFF' }, miniThumbOn: { alignSelf: 'flex-end' },
  mapShell: { height: 285, marginTop: 14, borderRadius: 25, overflow: 'hidden', borderWidth: 1, borderColor: '#ECDDD1', backgroundColor: '#EEE' }, map: { flex: 1 }, mapTopBadge: { position: 'absolute', left: 13, top: 13, paddingHorizontal: 12, height: 35, borderRadius: 18, backgroundColor: 'rgba(23,24,28,.91)', flexDirection: 'row', alignItems: 'center', gap: 7 }, pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#42D667' }, mapBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' }, locateButton: { position: 'absolute', right: 13, bottom: 13, width: 43, height: 43, borderRadius: 22, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', elevation: 4 },
  newBadge: { backgroundColor: '#FFF0E8', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12 }, newBadgeText: { color: ORANGE, fontSize: 9, fontWeight: '900' }, opportunity: { backgroundColor: '#FFF', padding: 10, marginBottom: 9, borderRadius: 18, flexDirection: 'row', gap: 11, alignItems: 'center', borderWidth: 1, borderColor: '#F0E4DA', elevation: 2, shadowColor: '#4F2A16', shadowOpacity: .06, shadowRadius: 7 }, opportunityArt: { width: 54, height: 54, borderRadius: 16, backgroundColor: '#FFF0E8', alignItems: 'center', justifyContent: 'center' }, oppImage: { width: 48, height: 48, resizeMode: 'contain' }, kind: { color: ORANGE, fontSize: 9, fontWeight: '900' }, oppTitle: { color: INK, fontSize: 13, fontWeight: '900', marginTop: 2 }, oppCopy: { color: '#858585', fontSize: 10, marginTop: 3 }, price: { color: INK, fontWeight: '900', fontSize: 13, marginBottom: 8 }, empty: { alignItems: 'center', padding: 26, borderRadius: 22, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#F0E4DA' }, emptyTitle: { color: INK, fontSize: 15, fontWeight: '900', marginTop: 8 }, emptyCopy: { color: '#898989', fontSize: 11, textAlign: 'center', marginTop: 4 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.38)' }, sheet: { backgroundColor: WARM, padding: 19, paddingBottom: 28, borderTopLeftRadius: 30, borderTopRightRadius: 30 }, handle: { width: 42, height: 5, borderRadius: 3, backgroundColor: '#DDD', alignSelf: 'center', marginBottom: 15 }, sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 }, sheetTitle: { color: INK, fontSize: 22, fontWeight: '900' }, sheetCopy: { color: '#808080', fontSize: 11, marginTop: 3 }, prefRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, borderRadius: 17, backgroundColor: '#FFF', marginBottom: 8, borderWidth: 1, borderColor: '#F0E4DA' }, prefArt: { width: 43, height: 43, resizeMode: 'contain' }, prefTitle: { color: INK, fontSize: 14, fontWeight: '900' }, prefCopy: { color: '#888', fontSize: 10, marginTop: 2 }, radiusTitle: { color: INK, fontWeight: '900', fontSize: 14, marginTop: 8 }, radiusRow: { flexDirection: 'row', gap: 7, marginTop: 9 }, radius: { flex: 1, borderWidth: 1, borderColor: '#DDD', paddingVertical: 9, borderRadius: 14, alignItems: 'center' }, radiusActive: { backgroundColor: ORANGE, borderColor: ORANGE }, radiusText: { color: '#777', fontSize: 10, fontWeight: '800' }, radiusTextActive: { color: '#FFF' }, doneButton: { height: 52, borderRadius: 17, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center', marginTop: 17 }, doneText: { color: '#FFF', fontWeight: '900', fontSize: 15 },
  offerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.58)', padding: 14 }, offerCard: { borderRadius: 28, backgroundColor: WARM, padding: 21, alignItems: 'center' }, offerTimer: { width: 66, height: 66, borderRadius: 33, borderWidth: 5, borderColor: ORANGE, alignItems: 'center', justifyContent: 'center' }, offerSeconds: { color: INK, fontSize: 25, fontWeight: '900', lineHeight: 26 }, offerSecLabel: { color: '#777', fontSize: 8, fontWeight: '800' }, offerEyebrow: { color: ORANGE, fontSize: 9, letterSpacing: 1.4, fontWeight: '900', marginTop: 13 }, offerTitle: { color: INK, fontSize: 24, fontWeight: '900', marginBottom: 15 }, offerRoute: { color: INK, fontSize: 13, fontWeight: '700', marginVertical: 5, textAlign: 'center' }, offerPrice: { color: INK, fontSize: 28, fontWeight: '900', marginTop: 15 }, offerActions: { flexDirection: 'row', gap: 9, marginTop: 18 }, reject: { flex: 1, height: 53, borderRadius: 17, borderWidth: 1.5, borderColor: '#D7D7D7', alignItems: 'center', justifyContent: 'center' }, rejectText: { color: INK, fontWeight: '900' }, accept: { flex: 1, height: 53, borderRadius: 17, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center' }, acceptText: { color: '#FFF', fontWeight: '900' },
  privacyPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF0E8', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 13 }, privacyText: { color: '#70402A', fontSize: 10, fontWeight: '700' }, jobFacts: { width: '100%', flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 15, marginTop: 8, borderBottomWidth: 1, borderBottomColor: '#EEE2D8' }, factLabel: { color: '#999', fontSize: 8, fontWeight: '900', letterSpacing: 1 }, factValue: { color: INK, fontSize: 15, fontWeight: '900', marginTop: 3 }, counter: { flex: 1, height: 53, borderRadius: 17, borderWidth: 1.5, borderColor: ORANGE, alignItems: 'center', justifyContent: 'center' }, counterText: { color: ORANGE, fontSize: 11, fontWeight: '900' },
  counterInputRow: { width: '100%', height: 48, marginTop: 12, borderWidth: 1.5, borderColor: '#FFD0BB', borderRadius: 15, backgroundColor: '#FFF', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 }, currency: { color: ORANGE, fontSize: 17, fontWeight: '900' }, counterInput: { flex: 1, color: INK, fontSize: 17, fontWeight: '900', marginLeft: 6, outlineStyle: 'none' } as any,
  activeSafe: { flex: 1, backgroundColor: WARM }, activeTop: { height: 68, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: WARM }, activeTopTitle: { color: INK, fontWeight: '900', fontSize: 17 }, activeMap: { height: '47%', minHeight: 260 }, activeSheet: { flex: 1, backgroundColor: WARM, marginTop: -22, borderTopLeftRadius: 28, borderTopRightRadius: 28 }, clientRow: { flexDirection: 'row', alignItems: 'center', gap: 9 }, clientAvatar: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: INK }, clientName: { color: INK, fontSize: 17, fontWeight: '900' }, clientRating: { color: '#777', fontSize: 10, marginTop: 3 }, contactButton: { width: 43, height: 43, borderRadius: 22, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#EEE2D8' }, activeTitleRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 18 }, activeTitle: { color: INK, fontSize: 22, fontWeight: '900' }, activeSubtitle: { color: '#737373', fontSize: 11, marginTop: 4 }, gainPill: { padding: 10, borderRadius: 14, backgroundColor: '#FFF0E8' }, gainLabel: { color: '#86604D', fontSize: 8, fontWeight: '800' }, gainValue: { color: INK, fontSize: 17, fontWeight: '900', marginTop: 2 }, steps: { flexDirection: 'row', marginTop: 23, marginBottom: 18 }, step: { flex: 1, alignItems: 'center' }, stepDot: { width: 25, height: 25, borderRadius: 13, backgroundColor: '#D5D5D5', alignItems: 'center', justifyContent: 'center' }, stepDone: { backgroundColor: ORANGE }, stepText: { color: '#999', fontSize: 8, marginTop: 6, textAlign: 'center' }, stepTextDone: { color: ORANGE, fontWeight: '900' }, activePrimary: { height: 55, backgroundColor: ORANGE, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, activePrimaryText: { color: '#FFF', fontSize: 16, fontWeight: '900' }, cancelLink: { color: '#777', fontSize: 11, textAlign: 'center', textDecorationLine: 'underline', marginVertical: 14 },
});
