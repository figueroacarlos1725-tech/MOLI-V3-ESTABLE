import React, { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiService } from '@/src/services/api';
import { MOLI_COLORS } from '@/src/theme/colors';
import { PromotionPlanChoice, PromotionPlan } from '@/src/components/PromotionPlan';
import { AUTH_FEATURES } from '@/src/config/features';

type Channel = 'email' | 'whatsapp';
type Capability = 'ride_driver' | 'moto_driver' | 'taxi_driver' | 'professional' | 'tramites' | 'parcel' | 'delivery' | 'merchant';
const CAPABILITIES: { id: Capability; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'ride_driver', label: 'Conductor de auto', icon: 'car' }, { id: 'moto_driver', label: 'Conductor de moto', icon: 'bicycle' },
  { id: 'taxi_driver', label: 'Taxi', icon: 'car-sport' }, { id: 'professional', label: 'Profesional', icon: 'construct' },
  { id: 'tramites', label: 'Trámites', icon: 'document-text' }, { id: 'parcel', label: 'Encomiendas', icon: 'cube' },
  { id: 'delivery', label: 'Repartos', icon: 'fast-food' }, { id: 'merchant', label: 'Comercio', icon: 'storefront' },
];

export default function RegisterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ capabilities?: string; role?: string; isPro?: string }>();
  const initial = useMemo(() => {
    const explicit = (params.capabilities || '').split(',').filter(Boolean) as Capability[];
    if (explicit.length) return explicit;
    if (params.isPro === '1') return ['professional'] as Capability[];
    if (params.role === 'driver') return ['ride_driver'] as Capability[];
    return [];
  }, [params.capabilities, params.isPro, params.role]);
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', confirm: '', code: '' });
  const [capabilities, setCapabilities] = useState<Capability[]>(initial);
  const [promotionPlan, setPromotionPlan] = useState<PromotionPlan>('standard_15');
  const hasMobility = capabilities.some(c => ['ride_driver', 'moto_driver', 'taxi_driver'].includes(c));
  const [channel, setChannel] = useState<Channel>('email');
  const [step, setStep] = useState<'details' | 'otp' | 'verified' | 'pending' | 'created'>('details');
  const [verificationToken, setVerificationToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const notify = (title: string, message: string) => setNotice(`${title}: ${message}`);
  const set = (key: keyof typeof form, value: string) => setForm(prev => ({ ...prev, [key]: value }));
  const toggle = (id: Capability) => setCapabilities(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const validate = () => {
    if (form.name.trim().length < 2) return 'Ingresá tu nombre completo';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return 'Ingresá un email válido';
    if (!/^\+[1-9]\d{7,14}$/.test(form.phone.replace(/[\s().-]/g, ''))) return 'Usá formato internacional, por ejemplo +549...';
    if (form.password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
    if (form.password !== form.confirm) return 'Las contraseñas no coinciden';
    return null;
  };
  const requestOtp = async () => { setNotice(''); const error = validate(); if (error) return notify('Revisá tus datos', error); setBusy(true); try { const r = await apiService.post('/registration/otp/request', { phone: form.phone, email: form.email.trim(), channel, purpose: 'register' }); setChannel(r.channel); setStep('otp'); } catch (e: any) { notify('No pudimos enviar el código', e.message); } finally { setBusy(false); } };
  const verifyOtp = async () => { setNotice(''); if (!/^\d{6}$/.test(form.code)) return notify('Código inválido', 'Ingresá los 6 números.'); setBusy(true); try { const r = await apiService.post('/registration/otp/verify', { phone: form.phone, code: form.code, purpose: 'register' }); setVerificationToken(r.verification_token); setStep('verified'); } catch (e: any) { notify('No se pudo verificar', e.message); } finally { setBusy(false); } };
  const submit = async () => { setNotice(''); setBusy(true); try { const r = await apiService.post('/registration/submit', { verification_token: verificationToken, phone: form.phone, email: form.email.trim(), name: form.name.trim(), password: form.password, capabilities, promotion_plan: hasMobility ? promotionPlan : undefined }); if (r.status === 'pending') setStep('pending'); else { setNotice(r.message || 'Ya podés iniciar sesión.'); setStep('created'); } } catch (e: any) { notify('No se pudo registrar', e.message); } finally { setBusy(false); } };
  if (step === 'created') return <SafeAreaView style={s.center}><Ionicons name="checkmark-circle" size={64} color={MOLI_COLORS.primary} /><Text style={s.title}>Cuenta creada</Text><Text style={s.centerText}>{notice}</Text><TouchableOpacity style={s.primary} accessibilityRole="button" onPress={() => router.replace('/(auth)/login')}><Text style={s.primaryText}>Iniciar sesión</Text></TouchableOpacity></SafeAreaView>;
  if (step === 'pending') return <SafeAreaView style={s.center}><View style={s.statusIcon}><Ionicons name="time" size={42} color={MOLI_COLORS.warning} /></View><Text style={s.title}>Registro en revisión</Text><Text style={s.centerText}>Administración revisará tus capacidades de proveedor y te avisaremos cuando sean aprobadas.</Text><TouchableOpacity style={s.primary} onPress={() => router.replace('/(auth)/welcome')} accessibilityRole="button"><Text style={s.primaryText}>Volver al inicio</Text></TouchableOpacity></SafeAreaView>;
  return <SafeAreaView style={s.container}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <TouchableOpacity style={s.back} onPress={() => router.back()} accessibilityLabel="Volver"><Ionicons name="arrow-back" size={24} color={MOLI_COLORS.navy} /></TouchableOpacity><Text style={s.eyebrow}>TU PERFIL MOLI</Text><Text style={s.title}>Creá tu cuenta</Text><Text style={s.subtitle}>Un único perfil para viajar, trabajar y vender.</Text>
    {!!notice && <Text accessibilityRole="alert" style={{color:'#B42318',backgroundColor:'#FEF3F2',padding:14,borderRadius:12}}>{notice}</Text>}
    {step === 'details' && <><TextInput style={s.input} placeholder="Nombre completo" value={form.name} onChangeText={v => set('name', v)} /><TextInput style={s.input} placeholder="Teléfono +549..." keyboardType="phone-pad" value={form.phone} onChangeText={v => set('phone', v)} /><TextInput style={s.input} placeholder="Email" keyboardType="email-address" autoCapitalize="none" value={form.email} onChangeText={v => set('email', v)} />
      <Text style={s.label}>Verificación de la cuenta</Text><View style={s.row}>{((AUTH_FEATURES.whatsapp ? ['email', 'whatsapp'] : ['email']) as Channel[]).map(c => <TouchableOpacity key={c} style={[s.choice, channel === c && s.selected]} onPress={() => setChannel(c)}><Ionicons name={c === 'whatsapp' ? 'logo-whatsapp' : 'mail'} size={20} color={channel === c ? '#fff' : MOLI_COLORS.primary} /><Text style={[s.choiceText, channel === c && { color: '#fff' }]}>{c === 'whatsapp' ? 'WhatsApp' : 'Código por email'}</Text></TouchableOpacity>)}</View>
      <TextInput style={s.input} placeholder="Contraseña (mínimo 8)" secureTextEntry value={form.password} onChangeText={v => set('password', v)} /><TextInput style={s.input} placeholder="Repetir contraseña" secureTextEntry value={form.confirm} onChangeText={v => set('confirm', v)} />
      <Text style={s.label}>Servicios opcionales</Text><View style={s.caps}>{CAPABILITIES.map(c => <TouchableOpacity key={c.id} style={[s.cap, capabilities.includes(c.id) && s.capSelected]} onPress={() => toggle(c.id)}><Ionicons name={c.icon} size={18} color={capabilities.includes(c.id) ? '#fff' : '#636366'} /><Text style={[s.capText, capabilities.includes(c.id) && { color: '#fff' }]}>{c.label}</Text></TouchableOpacity>)}</View>{hasMobility && <PromotionPlanChoice value={promotionPlan} onChange={setPromotionPlan} />}<TouchableOpacity style={s.primary} onPress={requestOtp} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Enviar código</Text>}</TouchableOpacity></>}
    {step === 'otp' && <View><Text style={s.label}>Código enviado por {channel === 'whatsapp' ? 'WhatsApp' : 'email'}</Text><TextInput style={[s.input, { textAlign: 'center', fontSize: 26, letterSpacing: 8 }]} placeholder="000000" keyboardType="number-pad" maxLength={6} value={form.code} onChangeText={v => set('code', v.replace(/\D/g, ''))} /><TouchableOpacity style={s.primary} onPress={verifyOtp} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Verificar código</Text>}</TouchableOpacity><TouchableOpacity style={{minHeight:44,justifyContent:'center'}} accessibilityRole="button" onPress={requestOtp} disabled={busy}><Text style={s.link}>Reenviar código</Text></TouchableOpacity><TouchableOpacity style={{minHeight:44,justifyContent:'center'}} accessibilityRole="button" disabled={busy} onPress={()=>{setStep('details');setNotice('');setVerificationToken('');set('code','');}}><Text style={s.link}>Corregir mis datos</Text></TouchableOpacity></View>}
    {step === 'verified' && <View style={s.center}><Ionicons name="checkmark-circle" size={64} color={MOLI_COLORS.primary} /><Text style={s.title}>Datos verificados</Text><Text style={s.centerText}>{capabilities.length ? 'Cada capacidad quedará pendiente de aprobación. Podrás trabajar provisoriamente durante 24 horas mientras revisamos la documentación.' : 'Tu cuenta de cliente se activará inmediatamente.'}</Text><TouchableOpacity style={s.primary} onPress={submit} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Completar registro</Text>}</TouchableOpacity></View>}
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
const s = StyleSheet.create({ container:{flex:1,backgroundColor:MOLI_COLORS.surface},content:{padding:24,gap:14,maxWidth:620,width:'100%',alignSelf:'center'},center:{flex:1,justifyContent:'center',alignItems:'center',padding:28,gap:18,backgroundColor:MOLI_COLORS.surface},back:{width:44,height:44,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:MOLI_COLORS.white},eyebrow:{fontSize:11,fontWeight:'800',color:MOLI_COLORS.primary,letterSpacing:1.4,marginTop:12},title:{fontSize:30,fontWeight:'800',color:MOLI_COLORS.navy,marginTop:2},subtitle:{fontSize:15,color:MOLI_COLORS.gray,marginBottom:8},centerText:{fontSize:15,color:MOLI_COLORS.gray,textAlign:'center',lineHeight:22,maxWidth:420},label:{fontSize:14,fontWeight:'700',color:MOLI_COLORS.darkGray,marginTop:8},input:{borderWidth:1,borderColor:MOLI_COLORS.lightGray,borderRadius:16,padding:15,fontSize:16,color:MOLI_COLORS.darkGray,backgroundColor:MOLI_COLORS.white,minHeight:54},row:{flexDirection:'row',gap:10},choice:{flex:1,flexDirection:'row',gap:8,justifyContent:'center',alignItems:'center',padding:14,borderRadius:16,borderWidth:1,borderColor:MOLI_COLORS.primary},selected:{backgroundColor:MOLI_COLORS.primary},choiceText:{fontWeight:'700',color:MOLI_COLORS.primary},caps:{flexDirection:'row',flexWrap:'wrap',gap:8},cap:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:12,paddingVertical:10,borderRadius:18,backgroundColor:MOLI_COLORS.white,borderWidth:1,borderColor:MOLI_COLORS.lightGray},capSelected:{backgroundColor:MOLI_COLORS.primary,borderColor:MOLI_COLORS.primary},capText:{fontSize:12,fontWeight:'600',color:MOLI_COLORS.gray},primary:{backgroundColor:MOLI_COLORS.primary,borderRadius:18,padding:17,alignItems:'center',marginTop:14,minWidth:220,minHeight:54},primaryText:{color:'#fff',fontSize:16,fontWeight:'800'},link:{textAlign:'center',color:MOLI_COLORS.primaryDark,fontWeight:'700',padding:16},statusIcon:{width:80,height:80,borderRadius:24,backgroundColor:'#FFF4E2',alignItems:'center',justifyContent:'center'} });
