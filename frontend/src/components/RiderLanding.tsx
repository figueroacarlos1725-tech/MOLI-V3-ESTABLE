import React, { useEffect, useState } from 'react';
import { Image, ImageSourcePropType, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiService } from '@/src/services/api';
import { MOLI_COLORS as C, MOLI_SHADOWS as SH } from '@/src/theme/colors';

type Category={id?:string;category_id?:string;name:string;icon?:keyof typeof Ionicons.glyphMap};
type Professional={user_id:string;name:string;categories:string[];rating?:number;total_jobs?:number};
const FALLBACK:Category[]=[{id:'electricista',name:'Electricista',icon:'flash'},{id:'plomero',name:'Plomería',icon:'water'},{id:'limpieza',name:'Limpieza',icon:'sparkles'},{id:'pintura',name:'Pintura',icon:'color-palette'},{id:'tecnologia',name:'Tecnología',icon:'laptop'},{id:'otro',name:'Ver todos',icon:'grid'}];
const PROFESSION_ART:Record<string,ImageSourcePropType>={
  electricista:require('../../assets/professions/electrician.png'),
  plomero:require('../../assets/professions/plumber.png'),
  plomeria:require('../../assets/professions/plumber.png'),
  limpieza:require('../../assets/professions/cleaner.png'),
  mudanza:require('../../assets/professions/mover.png'),
  mudanzas:require('../../assets/professions/mover.png'),
  pintura:require('../../assets/professions/painter.png'),
  pintor:require('../../assets/professions/painter.png'),
  jardineria:require('../../assets/professions/gardener.png'),
  jardinero:require('../../assets/professions/gardener.png'),
  carpinteria:require('../../assets/professions/carpenter.png'),
  carpintero:require('../../assets/professions/carpenter.png'),
  mecanica:require('../../assets/professions/mechanic.png'),
  mecanico:require('../../assets/professions/mechanic.png'),
  tecnologia:require('../../assets/professions/technician.png'),
  tecnico:require('../../assets/professions/technician.png'),
};
const PROFILE_ART:ImageSourcePropType[]=[PROFESSION_ART.electricista,PROFESSION_ART.limpieza,PROFESSION_ART.plomero,PROFESSION_ART.tecnologia,PROFESSION_ART.pintura,PROFESSION_ART.mudanza];
const VERIFIED_TOOLS=require('../../assets/professions/verified-tools.png');
const artKey=(value:string='')=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const categoryArt=(category:Category)=>PROFESSION_ART[artKey(category.id||category.category_id||category.name)]||PROFESSION_ART[artKey(category.name)];

export default function RiderLanding({firstName,onProfile,onLogout}:{firstName:string;onProfile:()=>void;onLogout:()=>void}){
  const router=useRouter(); const [categories,setCategories]=useState(FALLBACK); const [pros,setPros]=useState<Professional[]>([]);
  useEffect(()=>{Promise.all([apiService.get('/jobs/categories').catch(()=>({categories:FALLBACK})),apiService.get('/jobs/professionals/available').catch(()=>({professionals:[]}))]).then(([c,p])=>{setCategories((c.categories||FALLBACK).slice(0,6));setPros((p.professionals||[]).slice(0,5));});},[]);
  const jobs=()=>router.push('/(jobs)/client-home');
  return <ScrollView style={s.screen} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
    <View pointerEvents="none" style={s.glowOne}/><View pointerEvents="none" style={s.glowTwo}/><Text pointerEvents="none" style={s.sparkle}>✦</Text>
    <View style={s.header}><View style={s.brand}><Image source={require('../../assets/icon.png')} style={s.logo}/><View><Text style={s.brandName}>moli</Text><View style={s.premiumPill}><Text style={s.premiumText}>SERVICIOS PREMIUM</Text></View></View></View><View style={s.actions}><View style={s.bell}><Ionicons name="notifications-outline" size={21}/><View style={s.notificationBadge}><Text style={s.notificationText}>2</Text></View></View><TouchableOpacity style={s.profile} onPress={onProfile}><Text style={s.initial}>{firstName.charAt(0).toUpperCase()}</Text><View style={s.profileDot}/></TouchableOpacity></View></View>
    <Text style={s.greeting}>Hola, {firstName}</Text><Text style={s.title}>¿Qué necesitás{`\n`}resolver hoy?</Text>
    <TouchableOpacity style={s.search} onPress={jobs}><Ionicons name="search" size={27} color="#949494"/><Text style={s.searchText}>Buscá un profesional o servicio</Text><View style={s.searchButton}><Ionicons name="search" size={25} color="#fff"/></View></TouchableOpacity>
    <TouchableOpacity style={s.hero} onPress={jobs}><View style={s.heroShine}/><Text style={s.heroSparkOne}>✦</Text><Text style={s.heroSparkTwo}>✦</Text><View style={s.heroCopy}><Text style={s.heroTitle}>Necesito un{`\n`}profesional</Text><Text style={s.heroText}>Contanos qué necesitás y{`\n`}encontrá ayuda confiable.</Text><View style={s.heroButton}><Text style={s.heroButtonText}>PEDIR AHORA</Text><Ionicons name="chevron-forward" size={20} color={C.primaryDark}/></View></View><View style={s.heroArt}><Image source={VERIFIED_TOOLS} style={s.heroImage} resizeMode="contain"/></View></TouchableOpacity>
    <View style={s.carouselDots}><View style={s.dotActive}/><View style={s.dot}/><View style={s.dot}/></View>
    <Section title="Servicios populares" action="Ver todos"/><View style={s.grid}>{categories.map((c,i)=>{const artwork=categoryArt(c);return <TouchableOpacity activeOpacity={0.82} key={c.id||c.category_id||i} style={s.category} onPress={jobs}><View style={s.categoryIcon}>{artwork?<Image source={artwork} style={s.categoryImage} resizeMode="contain"/>:<Ionicons name={(c.icon||'grid') as any} size={27} color={C.primary}/>}<View style={s.categoryBadge}><Ionicons name={(c.icon||'sparkles') as any} size={13} color="#fff"/></View></View><Text style={s.categoryText} numberOfLines={1}>{c.name}</Text></TouchableOpacity>})}</View>
    <Section title="Disponibles ahora" action="VER TODOS  ›"/><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.proRow}>{(pros.length?pros:[{user_id:'nearby',name:'Profesional verificado',categories:['Servicios'],rating:5,total_jobs:128}]).map((p,index)=><TouchableOpacity activeOpacity={0.84} key={p.user_id} style={s.proCard} onPress={jobs}><View style={s.avatar}><Image source={PROFILE_ART[index%PROFILE_ART.length]} style={s.profileImage} resizeMode="cover"/><View style={s.available}/></View><View style={s.proInfo}><View style={s.verifiedRow}><Ionicons name="shield-checkmark" size={16} color={C.primary}/><Text style={s.verifiedText}>Profesional verificado</Text></View><Text style={s.proName} numberOfLines={1}>{p.name}</Text><View style={s.ratingRow}><Ionicons name="star" size={15} color="#FFB400"/><Text style={s.rating}>{(p.rating||5).toFixed(1)}</Text></View><Text style={s.jobsCount}>{p.total_jobs||128} trabajos</Text></View></TouchableOpacity>)}</ScrollView>
    <TouchableOpacity style={s.tramite} onPress={()=>router.push({pathname:'/(jobs)/client-home',params:{service:'tramites'}})}><View style={s.tramiteIcon}><Ionicons name="document-text" size={27} color={C.primary}/></View><View style={{flex:1}}><Text style={s.tramiteTitle}>¿Necesitás hacer un trámite?</Text><Text style={s.tramiteText}>Pedí una gestión y seguí cada paso desde Moli.</Text></View><Ionicons name="chevron-forward" size={22} color={C.primary}/></TouchableOpacity>
    <Text style={s.more}>También en Moli</Text><View style={s.secondaryRow}><TouchableOpacity style={s.secondary} onPress={()=>router.push('/(rider)/home')}><Ionicons name="car-sport" size={23} color={C.primary}/><Text style={s.secondaryText}>Viajes</Text></TouchableOpacity><TouchableOpacity style={s.secondary} onPress={()=>router.push('/(marketplace)')}><Ionicons name="storefront" size={23} color={C.warning}/><Text style={s.secondaryText}>Market</Text></TouchableOpacity></View>
    <TouchableOpacity style={s.logout} onPress={onLogout}><Ionicons name="swap-horizontal" size={19} color={C.gray}/><Text style={s.logoutText}>Cambiar cuenta</Text></TouchableOpacity>
  </ScrollView>;
}
function Section({title,action}:{title:string;action:string}){return <View style={s.section}><Text style={s.sectionTitle}>{title}</Text><Text style={s.sectionAction}>{action}</Text></View>}
const s=StyleSheet.create({
  screen:{backgroundColor:'#FFF8F2'},
  content:{width:'100%',maxWidth:720,alignSelf:'center',paddingHorizontal:20,paddingBottom:46,backgroundColor:'#FFF8F2',overflow:'hidden'},
  glowOne:{position:'absolute',width:350,height:350,borderRadius:175,backgroundColor:'#FFF0E3',top:80,right:-170,opacity:.72},
  glowTwo:{position:'absolute',width:220,height:220,borderRadius:110,borderWidth:24,borderColor:'#FFF1E5',top:210,left:-145,opacity:.78},
  sparkle:{position:'absolute',right:34,top:185,color:'#FFD9BD',fontSize:35},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingTop:17,paddingBottom:25},
  brand:{flexDirection:'row',alignItems:'center',gap:10},
  logo:{width:42,height:42,borderRadius:13},
  brandName:{fontSize:27,fontWeight:'900',color:C.primary,letterSpacing:-1.3,lineHeight:28},
  premiumPill:{alignSelf:'flex-start',backgroundColor:C.primary,borderRadius:6,paddingHorizontal:6,paddingVertical:2,marginTop:1},
  premiumText:{fontSize:7,color:'#fff',fontWeight:'900',letterSpacing:.45},
  actions:{flexDirection:'row',gap:12,alignItems:'center'},
  bell:{width:45,height:45,borderRadius:23,backgroundColor:'#fff',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#F4E8DE',...SH.md},
  notificationBadge:{position:'absolute',right:-2,top:-3,minWidth:18,height:18,borderRadius:9,backgroundColor:C.primary,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'#FFF8F2'},
  notificationText:{color:'#fff',fontSize:9,fontWeight:'900'},
  profile:{width:48,height:48,borderRadius:24,backgroundColor:C.black,alignItems:'center',justifyContent:'center',borderWidth:3,borderColor:'#fff',...SH.md},
  initial:{color:'#fff',fontSize:18,fontWeight:'900'},
  profileDot:{position:'absolute',right:-1,bottom:1,width:13,height:13,borderRadius:7,backgroundColor:C.primary,borderWidth:2,borderColor:'#fff'},
  greeting:{color:C.black,fontSize:16,fontWeight:'500',marginTop:1},
  title:{color:C.black,fontSize:38,lineHeight:41,fontWeight:'900',letterSpacing:-1.6,marginTop:5},
  search:{height:68,backgroundColor:'#fff',borderRadius:34,flexDirection:'row',alignItems:'center',gap:13,paddingLeft:21,paddingRight:7,marginTop:24,borderWidth:1,borderColor:'#F2E8DF',shadowColor:'#6C4127',shadowOffset:{width:0,height:7},shadowOpacity:.15,shadowRadius:14,elevation:7},
  searchText:{color:'#929292',fontSize:14,flex:1},
  searchButton:{width:54,height:54,borderRadius:27,backgroundColor:C.primary,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'#FF9A6C',shadowColor:C.primaryDark,shadowOffset:{width:0,height:4},shadowOpacity:.35,shadowRadius:5,elevation:6},
  hero:{minHeight:220,backgroundColor:C.primary,borderRadius:28,padding:22,marginTop:24,flexDirection:'row',overflow:'hidden',borderWidth:2,borderColor:'#FF9366',shadowColor:C.primaryDark,shadowOffset:{width:0,height:8},shadowOpacity:.32,shadowRadius:10,elevation:9},
  heroShine:{position:'absolute',left:14,right:14,top:8,height:3,borderRadius:2,backgroundColor:'rgba(255,255,255,.5)'},
  heroSparkOne:{position:'absolute',color:'#FFE2C8',fontSize:24,right:140,top:78},
  heroSparkTwo:{position:'absolute',color:'#FFF4E8',fontSize:15,right:118,bottom:32},
  heroCopy:{flex:1,zIndex:2},
  heroTitle:{color:'#fff',fontSize:27,lineHeight:29,fontWeight:'900',letterSpacing:-.6,marginTop:5},
  heroText:{color:'#FFF6F0',fontSize:13,lineHeight:19,marginTop:11},
  heroButton:{alignSelf:'flex-start',backgroundColor:'#fff',borderRadius:24,paddingHorizontal:18,paddingVertical:13,flexDirection:'row',alignItems:'center',gap:9,marginTop:18,shadowColor:'#A62D00',shadowOffset:{width:0,height:5},shadowOpacity:.28,shadowRadius:6,elevation:5,borderBottomWidth:3,borderBottomColor:'#EADBD2'},
  heroButtonText:{color:C.primaryDark,fontSize:12,fontWeight:'900',letterSpacing:.4},
  heroArt:{width:126,height:126,borderRadius:40,backgroundColor:'rgba(255,255,255,.10)',alignItems:'center',justifyContent:'center',alignSelf:'center',marginLeft:-3},
  heroImage:{width:132,height:132},
  carouselDots:{height:24,marginTop:-12,alignSelf:'center',paddingHorizontal:18,backgroundColor:'#FFF8F2',borderTopLeftRadius:18,borderTopRightRadius:18,flexDirection:'row',alignItems:'center',gap:7,zIndex:4},
  dotActive:{width:19,height:8,borderRadius:4,backgroundColor:C.primary},
  dot:{width:8,height:8,borderRadius:4,backgroundColor:'#F0DCCE'},
  section:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:25,marginBottom:13},
  sectionTitle:{fontSize:20,fontWeight:'900',color:C.black,letterSpacing:-.35},
  sectionAction:{fontSize:10,fontWeight:'900',color:C.primaryDark,backgroundColor:'#fff',paddingHorizontal:12,paddingVertical:8,borderRadius:16,...SH.sm},
  grid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:13},
  category:{width:'31.5%',backgroundColor:'#fff',borderRadius:21,paddingTop:5,paddingBottom:10,alignItems:'center',borderWidth:1,borderColor:'#F2E4D8',shadowColor:'#6F4229',shadowOffset:{width:0,height:5},shadowOpacity:.13,shadowRadius:8,elevation:4},
  categoryIcon:{width:'100%',height:82,borderRadius:18,backgroundColor:'#FFF9F4',alignItems:'center',justifyContent:'center',overflow:'visible'},
  categoryImage:{width:80,height:80},
  categoryBadge:{position:'absolute',left:3,bottom:1,width:27,height:27,borderRadius:14,backgroundColor:C.primary,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'#fff',...SH.sm},
  categoryText:{fontSize:12,fontWeight:'800',color:C.black,marginTop:4,width:'100%',textAlign:'center'},
  proRow:{gap:12,paddingBottom:8},
  proCard:{width:225,minHeight:116,backgroundColor:'#fff',borderRadius:19,padding:10,flexDirection:'row',gap:10,borderWidth:1,borderColor:'#F1E3D8',shadowColor:'#6F4229',shadowOffset:{width:0,height:5},shadowOpacity:.13,shadowRadius:8,elevation:4},
  avatar:{width:82,height:96,borderRadius:15,backgroundColor:C.primaryGlow,alignItems:'center',justifyContent:'center'},
  profileImage:{width:82,height:96,borderRadius:15},
  available:{position:'absolute',left:-2,top:-2,width:16,height:16,borderRadius:8,backgroundColor:'#24C45A',borderWidth:3,borderColor:'#fff'},
  proInfo:{flex:1,paddingTop:2},
  verifiedRow:{flexDirection:'row',alignItems:'center',gap:3},
  verifiedText:{fontSize:8,lineHeight:10,fontWeight:'800',color:C.darkGray,flex:1},
  proName:{fontSize:12,fontWeight:'900',color:C.black,marginTop:5},
  ratingRow:{flexDirection:'row',alignItems:'center',gap:4,marginTop:5},
  rating:{fontSize:12,fontWeight:'900',color:C.black},
  jobsCount:{fontSize:10,color:C.mediumGray,marginTop:5},
  tramite:{marginTop:28,backgroundColor:'#fff',borderRadius:22,padding:17,flexDirection:'row',alignItems:'center',gap:14,borderWidth:1,borderColor:'#FFD8C4',...SH.md},
  tramiteIcon:{width:52,height:52,borderRadius:17,backgroundColor:C.primaryGlow,alignItems:'center',justifyContent:'center'},
  tramiteTitle:{fontSize:16,fontWeight:'900',color:C.black},
  tramiteText:{fontSize:12,lineHeight:17,color:C.gray,marginTop:3},
  more:{fontSize:15,fontWeight:'800',color:C.black,marginTop:25,marginBottom:11},
  secondaryRow:{flexDirection:'row',gap:11},
  secondary:{flex:1,backgroundColor:'#fff',borderRadius:17,padding:15,flexDirection:'row',alignItems:'center',gap:9,borderWidth:1,borderColor:'#EFEAE5',...SH.sm},
  secondaryText:{fontSize:13,fontWeight:'800',color:C.darkGray},
  logout:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,paddingVertical:24,marginTop:8},
  logoutText:{color:C.gray,fontSize:14,fontWeight:'700'}
});
