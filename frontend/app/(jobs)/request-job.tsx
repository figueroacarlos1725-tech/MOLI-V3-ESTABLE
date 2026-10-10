import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  ScrollView, TextInput, ActivityIndicator, Image,
  ImageSourcePropType, KeyboardAvoidingView, Platform, useWindowDimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { apiService } from '@/src/services/api';
import { useAuthStore } from '@/src/stores/authStore';
import { socketService } from '@/src/services/socket';
import { WebView } from 'react-native-webview';

const PAPERWORK_ART=require('../../assets/modules/paperwork.png');
const VERIFIED_ART=require('../../assets/professions/verified-tools.png');
const MINIMUM_JOB_BUDGET = 15000;
const MINIMUM_PAPERWORK_BUDGET = 10000;
const CATEGORIES:{id:string;name:string;icon:keyof typeof Ionicons.glyphMap;art?:ImageSourcePropType}[] = [
  { id: 'tramites', name: 'Trámites', icon: 'document-text', art: PAPERWORK_ART },
  { id: 'electricista', name: 'Electricista', icon: 'flash', art: require('../../assets/professions/electrician.png') },
  { id: 'plomero', name: 'Plomero', icon: 'water', art: require('../../assets/professions/plumber.png') },
  { id: 'limpieza', name: 'Limpieza', icon: 'sparkles', art: require('../../assets/professions/cleaner.png') },
  { id: 'mudanza', name: 'Mudanza', icon: 'cube', art: require('../../assets/professions/mover.png') },
  { id: 'pintura', name: 'Pintura', icon: 'color-palette', art: require('../../assets/professions/painter.png') },
  { id: 'jardineria', name: 'Jardinería', icon: 'leaf', art: require('../../assets/professions/gardener.png') },
  { id: 'carpinteria', name: 'Carpintería', icon: 'hammer', art: require('../../assets/professions/carpenter.png') },
  { id: 'mecanica', name: 'Mecánica', icon: 'construct', art: require('../../assets/professions/mechanic.png') },
  { id: 'tecnologia', name: 'Tecnología', icon: 'laptop', art: require('../../assets/professions/technician.png') },
  { id: 'otro', name: 'Otro servicio', icon: 'ellipsis-horizontal' },
];

type Phase = 'category' | 'details' | 'searching' | 'matched' | 'active';

export default function RequestJobScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  // React Native Web can report a few extra CSS pixels when the browser uses
  // display scaling. Keep the phone layout at two columns through 560 px so
  // artwork and labels never get squeezed into narrow three-column cards.
  const compact = width < 560;
  const { user } = useAuthStore();
  const params = useLocalSearchParams<{ lat?: string; lng?: string; addr?: string; service?: string }>();
  const isTramite = params.service === 'tramites';
  const [phase, setPhase] = useState<Phase>(isTramite ? 'details' : 'category');
  const [category, setCategory] = useState(isTramite ? 'tramites' : '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [address, setAddress] = useState(params.addr || 'Mi ubicación');
  const [location, setLocation] = useState<any>(
    params.lat ? { latitude: parseFloat(params.lat), longitude: parseFloat(params.lng || '-65.7852') } : null
  );
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const notify = (title: string, message: string) => setNotice(`${title}: ${message}`);
  const [jobId, setJobId] = useState<string | null>(null);
  const [professional, setProfessional] = useState<any>(null);
  const [searchAttempts, setSearchAttempts] = useState(0);
  const [searchStatus, setSearchStatus] = useState<string>('searching');
  const [reviewerName, setReviewerName] = useState('');

  // Auto-detect location (skip if already provided via params)
  useEffect(() => {
    if (location) return; // Already have location from client-home
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

  // WebSocket + poll for job acceptance when searching
  useEffect(() => {
    if (phase !== 'searching' || !jobId || !user?.user_id) return;

    // Use shared socketService for real-time updates
    socketService.connect(user.user_id);

    const unsubReviewing = socketService.on('job_reviewing', (msg: any) => {
      if (msg.job_id === jobId) {
        setSearchStatus('reviewing');
        setReviewerName(msg.professional_name || 'Un profesional');
      }
    });

    const unsubAccepted = socketService.on('job_accepted', (msg: any) => {
      if (msg.job_id === jobId) {
        setProfessional({
          name: msg.professional_name,
          id: msg.professional_id,
          rating: msg.professional_rating,
        });
        setPhase('matched');
      }
    });

    const unsubCounter = socketService.on('job_counter_offer', (msg: any) => {
      if (msg.job_id === jobId) router.replace({ pathname: '/(jobs)/job-status', params: { jobId } } as any);
    });

    const unsubDeclined = socketService.on('job_declined', (msg: any) => {
      if (msg.job_id === jobId) {
        setSearchStatus('declined');
        setReviewerName('');
        setTimeout(() => setSearchStatus('searching'), 3000);
      }
    });

    // Fallback polling
    const interval = setInterval(async () => {
      try {
        const r = await apiService.get(`/jobs/detail/${jobId}`);
        setSearchAttempts(prev => prev + 1);
        if (r.job?.status === 'negotiating') {
          router.replace({ pathname: '/(jobs)/job-status', params: { jobId } } as any);
          clearInterval(interval);
        } else if (r.job?.status === 'assigned') {
          setProfessional({
            name: r.job.assigned_name,
            id: r.job.assigned_to,
          });
          setPhase('matched');
          clearInterval(interval);
        } else if (r.job?.status === 'reviewing') {
          setSearchStatus('reviewing');
        } else if (r.job?.status === 'open') {
          setSearchStatus('searching');
        }
      } catch {}
    }, 5000);
    return () => {
      clearInterval(interval);
      unsubReviewing();
      unsubAccepted();
      unsubDeclined();
      unsubCounter();
    };
  }, [phase, jobId, user?.user_id]);

  const pickImage = async () => {
    setNotice('');
    try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if ((asset.fileSize || 0) > 2 * 1024 * 1024) { notify('Foto demasiado grande', 'Elegí una foto de hasta 2 MB.'); return; }
      if (!asset.base64 || asset.base64.length > 2800000) { notify('No pudimos adjuntar la foto', 'Elegí otra imagen de hasta 2 MB.'); return; }
      setPhoto(`data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`);
    }
    } catch { notify('No pudimos adjuntar', 'Intentá con otra imagen.'); }
  };

  const handleSubmit = async () => {
    setNotice('');
    if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) { notify('Falta ubicación', 'Elegí el lugar del servicio antes de publicar.'); return; }
    const minimumBudget = category === 'tramites' ? MINIMUM_PAPERWORK_BUDGET : MINIMUM_JOB_BUDGET;
    if (!title.trim()) { notify('Error', 'Escribí un título'); return; }
    if (!budget || parseFloat(budget) < minimumBudget) { notify('Presupuesto mínimo', `Esta categoría parte desde $${minimumBudget.toLocaleString('es-AR')}.`); return; }
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
      notify('Error', e.message || 'No se pudo publicar');
    } finally { setLoading(false); }
  };

  const handleCancel = async () => {
    if (jobId) {
      try { await apiService.put(`/jobs/${jobId}/status`, { status: 'cancelled' }); } catch (e: any) { notify('No se pudo cancelar', e.message || 'Intentá nuevamente.'); return; }
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
          <View style={s.headerCopy}><Text style={s.headerKicker}>MOLI PROFESIONALES</Text><Text style={[s.headerTitle,s.headerTitleMain]}>¿Qué necesitás?</Text></View>
          <Image source={VERIFIED_ART} style={s.headerArt} resizeMode="contain"/>
        </View>
        <ScrollView contentContainerStyle={s.categoryContent} showsVerticalScrollIndicator={false}>
          <View style={s.categoryIntro}><Text style={s.introEyebrow}>SOLUCIONES CERCA TUYO</Text><Text style={s.introTitle}>Elegí una categoría</Text><Text style={s.introText}>Te mostramos profesionales disponibles para resolverlo.</Text></View>
          <View style={s.catGrid}>{CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.id}
              activeOpacity={.84}
              style={[s.catCard,compact?s.catCardCompact:s.catCardWide]}
              onPress={() => { setCategory(cat.id); setPhase('details'); }}
            >
              <View style={s.catVisual}>{cat.art?<Image source={cat.art} style={s.catImage} resizeMode="contain"/>:<View style={s.otherIcon}><Ionicons name={cat.icon} size={35} color="#FF5A1F"/></View>}<View style={s.catBadge}><Ionicons name={cat.icon} size={14} color="#fff"/></View></View>
              <Text style={s.catName} numberOfLines={1}>{cat.name}</Text>
              <Text style={s.catHint}>{cat.id==='tramites'?'Gestiones sin vueltas':'Profesionales cerca'}</Text>
              <View style={s.catArrow}><Ionicons name="chevron-forward" size={14} color="#FF5A1F"/></View>
            </TouchableOpacity>
          ))}</View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── PHASE: FILL DETAILS ──
  if (phase === 'details') {
    return (
      <SafeAreaView style={s.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.detailsContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={s.header}>
              <TouchableOpacity onPress={() => setPhase('category')} style={s.backBtn}>
                <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
              </TouchableOpacity>
              <View style={s.headerCopy}><Text style={s.headerKicker}>NUEVA SOLICITUD</Text><Text style={[s.headerTitle,s.headerTitleMain]}>{catData?.name || 'Nuevo trabajo'}</Text></View>
              {catData?.art ? <Image source={catData.art} style={s.headerArt} resizeMode="contain"/> : <Ionicons name={catData?.icon || 'construct'} size={30} color="#FF5A1F"/>}
            </View>

            <View style={s.detailsBody}>
              <View style={s.detailsHero}><View style={s.detailsHeroIcon}><Ionicons name="sparkles" size={22} color="#fff"/></View><View style={{flex:1}}><Text style={s.detailsHeroTitle}>Contanos qué necesitás</Text><Text style={s.detailsHeroCopy}>Cuantos más detalles agregues, mejor será la respuesta.</Text></View></View>
              <View style={s.formCard}>
                <View style={s.fieldHeading}><View style={s.fieldIcon}><Ionicons name="create" size={17} color="#FF5A1F"/></View><Text style={s.label}>¿Qué necesitás? *</Text></View>
                <TextInput style={s.input} placeholder="Ej: Arreglar canilla que gotea" placeholderTextColor="#C7C7CC" value={title} onChangeText={setTitle} />
              </View>

              <View style={s.formCard}>
                <View style={s.fieldHeading}><View style={s.fieldIcon}><Ionicons name="reader" size={17} color="#FF5A1F"/></View><Text style={s.label}>Descripción (opcional)</Text></View>
                <TextInput style={[s.input, { minHeight: 80 }]} placeholder="Detalles del trabajo..." placeholderTextColor="#C7C7CC" value={description} onChangeText={setDescription} multiline textAlignVertical="top" />
              </View>

              <View style={s.formCard}>
                <View style={s.fieldHeading}><View style={s.fieldIcon}><Ionicons name="camera" size={17} color="#FF5A1F"/></View><Text style={s.label}>Foto del trabajo (opcional)</Text></View>
                <TouchableOpacity style={s.photoBtn} onPress={pickImage}>
                  {photo ? (
                    <Image source={{ uri: photo }} style={{ width: '100%', height: 150, borderRadius: 12 }} resizeMode="cover" />
                  ) : (
                    <View style={{ alignItems: 'center', gap: 8 }}>
                      <View style={s.photoIcon}><Ionicons name="add" size={25} color="#fff" /></View>
                      <Text style={s.photoText}>Agregar una foto</Text><Text style={s.photoHint}>Ayuda al profesional a evaluar mejor</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              <View style={s.formCard}>
                <View style={s.fieldHeading}><View style={s.fieldIcon}><Ionicons name="wallet" size={17} color="#FF5A1F"/></View><Text style={s.label}>¿Cuánto querés pagar? *</Text></View>
                <View style={s.priceRow}>
                  <Text style={{ fontSize: 24, fontWeight: '800', color: '#1C1C1E' }}>$</Text>
                  <TextInput style={s.priceInput} placeholder={category === 'tramites' ? '10000' : '15000'} placeholderTextColor="#C7C7CC" value={budget} onChangeText={t => setBudget(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" />
                </View>
                <Text style={s.minimumBudgetHint}>Tarifa mínima de publicación: {category === 'tramites' ? '$10.000' : '$15.000'}</Text>
              </View>

              <View style={s.formCard}>
                <View style={s.fieldHeading}><View style={s.fieldIcon}><Ionicons name="location" size={17} color="#FF5A1F"/></View><Text style={s.label}>Ubicación del servicio</Text></View>
                <TouchableOpacity style={s.locationRow} accessibilityRole="button" onPress={() => router.push('/(jobs)/client-home')}>
                  <Ionicons name="location" size={20} color="#FF7733" />
                  <Text style={{ flex: 1, fontSize: 14, color: '#1C1C1E' }}>{address} · Cambiar</Text>
                </TouchableOpacity>
              </View>

              {!!notice && <Text accessibilityRole="alert" style={{color:'#B42318',backgroundColor:'#FEF3F2',padding:12,borderRadius:12,marginBottom:12}}>{notice}</Text>}
              <TouchableOpacity style={s.submitBtn} onPress={handleSubmit} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : (
                  <><Ionicons name="search" size={20} color="#fff"/><Text style={s.submitBtnText}>Buscar profesional</Text><Ionicons name="arrow-forward" size={20} color="#fff"/></>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Snake Game HTML ──
  const snakeGameHtml = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#F8F8FA;display:flex;justify-content:center;align-items:center;height:100vh;font-family:system-ui}canvas{background:#1C1C1E;border-radius:16px;touch-action:none}#score{color:#8E8E93;font-size:13px;text-align:center;margin-top:8px;font-weight:600}.wrap{text-align:center}h3{color:#8E8E93;font-size:11px;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px}</style></head><body><div class="wrap"><h3>Deslizá para jugar</h3><canvas id="c" width="240" height="240"></canvas><div id="score">Puntos: 0</div></div><script>var c=document.getElementById('c'),x=c.getContext('2d'),s=12,w=c.width/s,h=c.height/s,snake=[{x:10,y:10}],dir={x:1,y:0},food={x:5,y:5},score=0,started=false;function draw(){x.fillStyle='#1C1C1E';x.fillRect(0,0,c.width,c.height);x.fillStyle='#FF7733';snake.forEach(function(p){x.fillRect(p.x*s+1,p.y*s+1,s-2,s-2)});x.fillStyle='#FF3B30';x.fillRect(food.x*s+1,food.y*s+1,s-2,s-2)}function move(){var head={x:snake[0].x+dir.x,y:snake[0].y+dir.y};head.x=(head.x+w)%w;head.y=(head.y+h)%h;for(var i=0;i<snake.length;i++){if(snake[i].x===head.x&&snake[i].y===head.y){snake=[{x:10,y:10}];dir={x:1,y:0};score=0;document.getElementById('score').textContent='Puntos: 0';return}}snake.unshift(head);if(head.x===food.x&&head.y===food.y){score++;document.getElementById('score').textContent='Puntos: '+score;food={x:Math.floor(Math.random()*w),y:Math.floor(Math.random()*h)}}else{snake.pop()}}function loop(){move();draw();setTimeout(loop,120)}var tx,ty;c.addEventListener('touchstart',function(e){tx=e.touches[0].clientX;ty=e.touches[0].clientY;if(!started){started=true;loop()}});c.addEventListener('touchend',function(e){var dx=e.changedTouches[0].clientX-tx,dy=e.changedTouches[0].clientY-ty;if(Math.abs(dx)>Math.abs(dy)){dir=dx>0?{x:1,y:0}:{x:-1,y:0}}else{dir=dy>0?{x:0,y:1}:{x:0,y:-1}}});draw()</script></body></html>`;

  // ── PHASE: SEARCHING ──
  if (phase === 'searching') {
    const reviewing = searchStatus === 'reviewing';
    return (
      <SafeAreaView style={s.container}>
        <View style={s.searchPage}>
          <View style={s.searchHeader}>
            <View><Text style={s.searchKicker}>MOLI PROFESIONALES</Text><Text style={s.searchHeaderTitle}>Tu solicitud está activa</Text></View>
            <TouchableOpacity accessibilityRole="button" style={s.minimizeBtn} onPress={() => router.replace('/modules')}>
              <Ionicons name="remove" size={25} color="#202124" />
            </TouchableOpacity>
          </View>

          <View style={[s.searchStatusCard, reviewing && s.searchStatusCardReviewing]}>
            <View style={s.searchStatusTop}>
              <View style={[s.searchOrb, reviewing && s.searchOrbReviewing]}>
                {reviewing ? <Ionicons name="eye" size={26} color="#fff"/> : <ActivityIndicator color="#fff"/>}
              </View>
              <View style={{flex:1}}><Text style={s.searchEyebrow}>{reviewing ? 'ALGUIEN LA ESTÁ VIENDO' : 'BUSCANDO CERCA TUYO'}</Text><Text style={s.searchMainTitle}>{reviewing ? `${reviewerName || 'Un profesional'} está revisando` : `Buscando ${catData?.name?.toLowerCase() || 'profesional'}`}</Text></View>
              <View style={s.budgetPill}><Text style={s.budgetLabel}>OFRECÉS</Text><Text style={s.budgetValue}>${budget}</Text></View>
            </View>
            <View style={s.progressTrack}><View style={[s.progressFill, reviewing && {width:'82%',backgroundColor:'#FFB020'}]}/></View>
            <Text style={s.searchStatusCopy}>{reviewing ? 'Tiene 30 segundos para decidir. Si no acepta, seguimos buscando automáticamente.' : 'Estamos notificando profesionales disponibles. Podés minimizar y continuar usando Moli.'}</Text>
          </View>

          <View style={s.searchMessage}>
            {searchStatus === 'reviewing' ? (
              <>
                <Ionicons name="notifications" size={18} color="#FF8A00"/><Text style={s.searchMessageText}>Te avisaremos apenas responda</Text>
              </>
            ) : searchStatus === 'declined' ? (
              <>
                <Ionicons name="refresh" size={18} color="#FF5A1F"/><Text style={s.searchMessageText}>No pudo tomarlo. Ya buscamos otro profesional.</Text>
              </>
            ) : (
              <>
                <Ionicons name="shield-checkmark" size={18} color="#20B768"/><Text style={s.searchMessageText}>Tu dirección exacta permanece protegida</Text>
              </>
            )}
          </View>

          {/* Snake Game */}
          <View style={s.gameCard}>
            <View style={s.gameLabel}><Ionicons name="game-controller" size={15} color="#FF5A1F"/><Text style={s.gameLabelText}>MIENTRAS ESPERÁS</Text></View>
            {Platform.OS === 'web' ? (
              <iframe
                srcDoc={snakeGameHtml}
                style={{ width: '100%', height: '100%', border: 'none', borderRadius: 20 } as any}
              />
            ) : (
              <WebView
                source={{ html: snakeGameHtml }}
                style={{ flex: 1, borderRadius: 20, backgroundColor: '#F8F8FA' }}
                javaScriptEnabled
                scrollEnabled={false}
              />
            )}
          </View>

          {searchAttempts > 10 && (
            <Text style={{ fontSize: 13, color: '#FF9500', textAlign: 'center', marginBottom: 8 }}>
              Está tardando más de lo normal. Podés seguir esperando.
            </Text>
          )}
          {!!notice && <Text accessibilityRole="alert" style={{color:'#B42318',padding:12}}>{notice}</Text>}
          <View style={s.searchActions}><TouchableOpacity style={s.keepBrowsingBtn} onPress={() => router.replace('/modules')}><Ionicons name="contract" size={18} color="#fff"/><Text style={s.keepBrowsingText}>Minimizar y seguir usando Moli</Text></TouchableOpacity><TouchableOpacity style={s.cancelBtn} onPress={handleCancel}><Text style={s.cancelText}>Cancelar solicitud</Text></TouchableOpacity></View>
        </View>
      </SafeAreaView>
    );
  }

  // ── PHASE: MATCHED ──
  if (phase === 'matched') {
    return (
      <SafeAreaView style={s.container}>
        <View style={[s.center, { padding: 40 }]}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,119,51,0.10)', justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="checkmark-circle" size={48} color="#FF7733" />
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#1C1C1E', marginTop: 20, textAlign: 'center' }}>
            ¡Profesional encontrado!
          </Text>
          <Text style={{ fontSize: 16, color: '#636366', marginTop: 8, textAlign: 'center' }}>
            {professional?.name || 'Un profesional'} aceptó tu trabajo
          </Text>
          <Text style={{ fontSize: 28, fontWeight: '800', color: '#FF7733', marginTop: 8 }}>${budget}</Text>
          <TouchableOpacity
            style={[s.submitBtn, { marginTop: 24 }]}
            onPress={() => {
              if (jobId) {
                router.replace({ pathname: '/(jobs)/job-status', params: { jobId } } as any);
              }
            }}
          >
            <Ionicons name="chatbubble" size={20} color="#fff" />
            <Text style={s.submitBtnText}> Ver trabajo y chatear</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ marginTop: 16 }} onPress={() => router.replace('/(jobs)/client-home' as any)}>
            <Text style={{ color: '#8E8E93', fontSize: 14 }}>Volver al inicio</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return null;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF8F2' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#FFF8F2', borderBottomWidth: 1, borderBottomColor: '#F0DFD2', shadowColor: '#6E432B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: .08, shadowRadius: 8, elevation: 4, zIndex: 5 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#F0DFD2', shadowColor: '#6E432B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: .13, shadowRadius: 7, elevation: 4 },
  headerCopy: { flex: 1, marginLeft: 12 },
  headerKicker: { fontSize: 9, lineHeight: 11, fontWeight: '900', letterSpacing: 1, color: '#E9480B' },
  headerTitle: { fontSize: 19, lineHeight: 23, fontWeight: '900', color: '#202124', marginLeft: 12 },
  headerTitleMain: { marginLeft: 0 },
  headerArt: { width: 52, height: 52 },
  categoryContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 18, paddingBottom: 44 },
  detailsContent:{width:'100%',maxWidth:650,alignSelf:'center',paddingBottom:42},detailsBody:{padding:18,gap:13},
  detailsHero:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#FF5A1F',borderRadius:23,padding:16,borderWidth:2,borderColor:'#FF9867',borderBottomWidth:5,borderBottomColor:'#E9480B',shadowColor:'#A9390C',shadowOffset:{width:0,height:6},shadowOpacity:.2,shadowRadius:9,elevation:7},
  detailsHeroIcon:{width:44,height:44,borderRadius:15,backgroundColor:'rgba(255,255,255,.2)',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'rgba(255,255,255,.42)'},detailsHeroTitle:{color:'#fff',fontSize:18,fontWeight:'900'},detailsHeroCopy:{color:'#FFF1E9',fontSize:11,lineHeight:15,fontWeight:'600',marginTop:3},
  formCard:{backgroundColor:'#fff',borderRadius:21,padding:14,borderWidth:1,borderColor:'#F0DFD2',borderBottomWidth:3,borderBottomColor:'#E8D6C8',shadowColor:'#6F4229',shadowOffset:{width:0,height:5},shadowOpacity:.11,shadowRadius:8,elevation:4},fieldHeading:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:9},fieldIcon:{width:30,height:30,borderRadius:11,backgroundColor:'#FFF0E7',alignItems:'center',justifyContent:'center'},
  categoryIntro: { backgroundColor: '#FF5A1F', borderRadius: 26, padding: 20, borderWidth: 2, borderColor: '#FF9867', borderBottomWidth: 5, borderBottomColor: '#E9480B', shadowColor: '#A9390C', shadowOffset: { width: 0, height: 7 }, shadowOpacity: .25, shadowRadius: 11, elevation: 8, marginBottom: 22 },
  introEyebrow: { color: '#FFE6D8', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  introTitle: { color: '#fff', fontSize: 25, fontWeight: '900', marginTop: 5, letterSpacing: -.5 },
  introText: { color: '#FFF7F2', fontSize: 12, lineHeight: 17, marginTop: 6, maxWidth: 360 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 },
  catCard: { backgroundColor: '#fff', borderRadius: 23, paddingTop: 6, paddingBottom: 13, borderWidth: 1, borderColor: '#F0DFD1', borderBottomWidth: 3, borderBottomColor: '#E8D6C8', shadowColor: '#6F4229', shadowOffset: { width: 0, height: 6 }, shadowOpacity: .16, shadowRadius: 9, elevation: 5, overflow: 'visible' },
  catCardCompact: { width: '48.2%' },
  catCardWide: { width: '31.7%' },
  catVisual: { width: '100%', height: 122, borderRadius: 20, backgroundColor: '#FFF9F4', alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
  catImage: { width: 121, height: 121 },
  otherIcon: { width: 75, height: 75, borderRadius: 25, backgroundColor: '#FFF0E7', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  catBadge: { position: 'absolute', left: 7, bottom: 5, width: 32, height: 32, borderRadius: 16, backgroundColor: '#FF5A1F', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff', shadowColor: '#E9480B', shadowOffset: { width: 0, height: 3 }, shadowOpacity: .32, shadowRadius: 4, elevation: 5 },
  catName: { fontSize: 14, lineHeight: 18, fontWeight: '900', color: '#202124', marginTop: 9, marginHorizontal: 11 },
  catHint: { fontSize: 9, lineHeight: 12, fontWeight: '600', color: '#8A8D91', marginTop: 2, marginHorizontal: 11 },
  catArrow: { position: 'absolute', right: 8, bottom: 13, width: 25, height: 25, borderRadius: 13, backgroundColor: '#FFF0E7', alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, fontWeight: '900', color: '#585B60', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#FAF7F4', borderRadius: 14, padding: 14, fontSize: 15, color: '#1C1C1E',borderWidth:1,borderColor:'#F1E7DF' },
  photoBtn: { backgroundColor: '#FFF9F5', borderRadius: 16, padding: 18, alignItems: 'center', borderWidth: 1.5, borderColor: '#FFD8C5', borderStyle: 'dashed' },photoIcon:{width:42,height:42,borderRadius:14,backgroundColor:'#FF5A1F',alignItems:'center',justifyContent:'center'},photoText:{color:'#202124',fontSize:13,fontWeight:'900'},photoHint:{color:'#96999D',fontSize:10,fontWeight:'600'},
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F2F2F7', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10 },
  priceInput: { flex: 1, fontSize: 28, fontWeight: '800', color: '#1C1C1E' },
  minimumBudgetHint:{fontSize:11,fontWeight:'700',color:'#E9480B',marginTop:7},
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F2F2F7', borderRadius: 14, padding: 14 },
  submitBtn: { flexDirection: 'row',gap:10, backgroundColor: '#FF5A1F', paddingVertical: 17, borderRadius: 17, alignItems: 'center', justifyContent: 'center',borderBottomWidth:5,borderBottomColor:'#E9480B',shadowColor:'#A9390C',shadowOffset:{width:0,height:6},shadowOpacity:.22,shadowRadius:8,elevation:7 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '900',flex:1,textAlign:'center',marginLeft:30 },
  searchPage:{flex:1,width:'100%',maxWidth:620,alignSelf:'center',paddingHorizontal:18,paddingBottom:14},
  searchHeader:{minHeight:72,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  searchKicker:{fontSize:9,fontWeight:'900',letterSpacing:1,color:'#E9480B'},searchHeaderTitle:{fontSize:20,fontWeight:'900',color:'#202124',marginTop:2},
  minimizeBtn:{width:43,height:43,borderRadius:22,backgroundColor:'#fff',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#F0DFD2',shadowColor:'#6E432B',shadowOffset:{width:0,height:4},shadowOpacity:.13,shadowRadius:7,elevation:4},
  searchStatusCard:{backgroundColor:'#FF5A1F',borderRadius:25,padding:17,borderWidth:2,borderColor:'#FF9867',borderBottomWidth:5,borderBottomColor:'#E9480B',shadowColor:'#A9390C',shadowOffset:{width:0,height:7},shadowOpacity:.24,shadowRadius:11,elevation:8},
  searchStatusCardReviewing:{backgroundColor:'#FF7900',borderColor:'#FFB368',borderBottomColor:'#DB5700'},searchStatusTop:{flexDirection:'row',alignItems:'center',gap:11},
  searchOrb:{width:48,height:48,borderRadius:16,backgroundColor:'rgba(255,255,255,.20)',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'rgba(255,255,255,.45)'},searchOrbReviewing:{backgroundColor:'rgba(123,46,0,.18)'},
  searchEyebrow:{color:'#FFE6D8',fontSize:8,fontWeight:'900',letterSpacing:.9},searchMainTitle:{color:'#fff',fontSize:17,lineHeight:21,fontWeight:'900',marginTop:2},
  budgetPill:{backgroundColor:'#fff',borderRadius:15,paddingHorizontal:10,paddingVertical:7,alignItems:'center'},budgetLabel:{fontSize:7,fontWeight:'900',color:'#A55A35',letterSpacing:.6},budgetValue:{fontSize:15,fontWeight:'900',color:'#202124'},
  progressTrack:{height:6,borderRadius:3,backgroundColor:'rgba(116,37,0,.20)',marginTop:14,overflow:'hidden'},progressFill:{height:'100%',width:'58%',borderRadius:3,backgroundColor:'#fff'},searchStatusCopy:{fontSize:11,lineHeight:16,fontWeight:'600',color:'#FFF4ED',marginTop:10},
  searchMessage:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,paddingVertical:12},searchMessageText:{fontSize:11,fontWeight:'700',color:'#5F6267'},
  gameCard:{flex:1,minHeight:230,borderRadius:24,overflow:'hidden',marginBottom:12,backgroundColor:'#fff',borderWidth:1,borderColor:'#F0DFD2',shadowColor:'#6E432B',shadowOffset:{width:0,height:5},shadowOpacity:.12,shadowRadius:9,elevation:4},gameLabel:{position:'absolute',top:10,left:12,zIndex:2,flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'#FFF0E7',borderRadius:12,paddingHorizontal:9,paddingVertical:5},gameLabelText:{fontSize:8,fontWeight:'900',letterSpacing:.8,color:'#E9480B'},
  searchActions:{gap:8},keepBrowsingBtn:{minHeight:52,borderRadius:17,backgroundColor:'#FF5A1F',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,borderBottomWidth:4,borderBottomColor:'#E9480B'},keepBrowsingText:{color:'#fff',fontSize:14,fontWeight:'900'},cancelBtn:{alignItems:'center',paddingVertical:8},cancelText:{color:'#A1A1A6',fontSize:12,fontWeight:'700'},
});
