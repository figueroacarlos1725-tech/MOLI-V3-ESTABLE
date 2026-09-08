import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiService } from '@/src/services/api';
import { socketService } from '@/src/services/socket';
import { useAuthStore } from '@/src/stores/authStore';

const ORANGE = '#FF5A1F';
const ACTIVE = new Set(['open', 'reviewing', 'negotiating', 'assigned', 'in_progress', 'pending_completion']);
const PRO_ART = require('../../assets/professions/technician.png');

type ActiveJob = {
  job_id: string;
  title?: string;
  category?: string;
  status: string;
  budget?: number;
  assigned_name?: string;
  reviewing_name?: string;
};

const statusCopy = (job: ActiveJob) => {
  if (job.status === 'reviewing') return { label: `${job.reviewing_name || 'Un profesional'} está revisando`, icon: 'eye' as const, color: '#FF8A00' };
  if (job.status === 'negotiating') return { label: 'Contrapropuesta esperando respuesta', icon: 'swap-horizontal' as const, color: '#FF5A1F' };
  if (job.status === 'assigned') return { label: `${job.assigned_name || 'Tu profesional'} aceptó`, icon: 'checkmark-circle' as const, color: '#20B768' };
  if (job.status === 'in_progress') return { label: 'Trabajo en curso', icon: 'construct' as const, color: '#20B768' };
  if (job.status === 'pending_completion') return { label: 'Esperando tu confirmación', icon: 'hourglass' as const, color: '#3478F6' };
  return { label: 'Buscando profesionales cerca', icon: 'radio' as const, color: ORANGE };
};

export default function ClientActiveRequests() {
  const router = useRouter();
  const userId = useAuthStore(s => s.user?.user_id);
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [notice, setNotice] = useState<string>('');

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await apiService.get('/jobs/my-posts');
      setJobs((res.jobs || []).filter((job: ActiveJob) => ACTIVE.has(job.status)));
    } catch {}
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    load();
    socketService.connect(userId);
    const reviewing = socketService.on('job_reviewing', (msg: any) => {
      setJobs(current => current.map(job => job.job_id === msg.job_id ? { ...job, status: 'reviewing', reviewing_name: msg.professional_name } : job));
      setNotice(`${msg.professional_name || 'Un profesional'} está revisando tu solicitud`);
    });
    const accepted = socketService.on('job_accepted', (msg: any) => {
      setJobs(current => current.map(job => job.job_id === msg.job_id ? { ...job, status: 'assigned', assigned_name: msg.professional_name } : job));
      setNotice(`${msg.professional_name || 'Un profesional'} aceptó tu solicitud`);
    });
    const declined = socketService.on('job_declined', (msg: any) => {
      setJobs(current => current.map(job => job.job_id === msg.job_id ? { ...job, status: 'open', reviewing_name: undefined } : job));
    });
    const timer = setInterval(load, 7000);
    return () => { clearInterval(timer); reviewing(); accepted(); declined(); };
  }, [load, userId]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6500);
    return () => clearTimeout(timer);
  }, [notice]);

  const job = jobs[0];
  const status = useMemo(() => job ? statusCopy(job) : null, [job]);
  if (!job || !status) return null;

  return (
    <View pointerEvents="box-none" style={s.layer}>
      {!!notice && <View style={s.notice}><View style={s.noticeIcon}><Ionicons name="notifications" size={17} color="#fff" /></View><Text style={s.noticeText} numberOfLines={2}>{notice}</Text></View>}
      <TouchableOpacity activeOpacity={.9} style={s.card} onPress={() => router.push({ pathname: '/(jobs)/job-status', params: { jobId: job.job_id } } as any)}>
        <View style={s.avatar}><Image source={PRO_ART} style={s.avatarImage}/><View style={[s.liveDot, { backgroundColor: status.color }]}/></View>
        <View style={s.copy}>
          <View style={s.topline}><View style={[s.statusDot, { backgroundColor: status.color }]}/><Text style={[s.status, { color: status.color }]}>{jobs.length > 1 ? `${jobs.length} SOLICITUDES ACTIVAS` : 'SOLICITUD ACTIVA'}</Text></View>
          <Text style={s.title} numberOfLines={1}>{job.title || job.category || 'Servicio profesional'}</Text>
          <View style={s.statusRow}><Ionicons name={status.icon} size={14} color={status.color}/><Text style={s.subtitle} numberOfLines={1}>{status.label}</Text></View>
        </View>
        <View style={s.action}><Ionicons name="chevron-up" size={19} color="#fff"/></View>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  layer:{position:'absolute',left:14,right:14,bottom:14,zIndex:50,alignItems:'center'},
  notice:{width:'100%',maxWidth:520,flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#202124',paddingHorizontal:14,paddingVertical:11,borderRadius:18,marginBottom:8,shadowColor:'#000',shadowOffset:{width:0,height:6},shadowOpacity:.2,shadowRadius:12,elevation:10},
  noticeIcon:{width:30,height:30,borderRadius:15,backgroundColor:ORANGE,alignItems:'center',justifyContent:'center'},
  noticeText:{flex:1,color:'#fff',fontSize:13,lineHeight:17,fontWeight:'700'},
  card:{width:'100%',maxWidth:520,minHeight:86,flexDirection:'row',alignItems:'center',backgroundColor:'#fff',borderRadius:25,padding:10,borderWidth:1,borderColor:'#FFD5C2',borderBottomWidth:4,borderBottomColor:'#E8C0AD',shadowColor:'#6E351C',shadowOffset:{width:0,height:8},shadowOpacity:.24,shadowRadius:14,elevation:12},
  avatar:{width:62,height:62,borderRadius:19,backgroundColor:'#FFF0E7',overflow:'visible',alignItems:'center',justifyContent:'flex-end'},
  avatarImage:{width:67,height:67,borderRadius:19},
  liveDot:{position:'absolute',left:-2,top:-2,width:14,height:14,borderRadius:7,borderWidth:3,borderColor:'#fff'},
  copy:{flex:1,paddingHorizontal:12},topline:{flexDirection:'row',alignItems:'center',gap:5},statusDot:{width:6,height:6,borderRadius:3},
  status:{fontSize:8,fontWeight:'900',letterSpacing:.8},title:{color:'#202124',fontSize:15,lineHeight:20,fontWeight:'900',marginTop:2},statusRow:{flexDirection:'row',alignItems:'center',gap:5,marginTop:2},subtitle:{flex:1,color:'#6F7277',fontSize:11,fontWeight:'600'},
  action:{width:38,height:38,borderRadius:19,backgroundColor:ORANGE,alignItems:'center',justifyContent:'center',shadowColor:'#E9480B',shadowOffset:{width:0,height:4},shadowOpacity:.28,shadowRadius:6,elevation:5},
});
