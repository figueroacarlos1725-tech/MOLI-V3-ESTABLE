import React, { useEffect, useState } from 'react';
import { Image, ImageSourcePropType, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiService } from '@/src/services/api';
import { MOLI_COLORS as C, MOLI_SHADOWS as SH } from '@/src/theme/colors';
import ClientActiveRequests from '@/src/components/ClientActiveRequests';
import ClientNotificationBell from '@/src/components/ClientNotificationBell';

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
const TRAVEL_ART=require('../../assets/modules/travel.png');
const PAPERWORK_ART=require('../../assets/modules/paperwork.png');
const MARKETPLACE_ART=require('../../assets/modules/marketplace.png');
const artKey=(value:string='')=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const categoryArt=(category:Category)=>PROFESSION_ART[artKey(category.id||category.category_id||category.name)]||PROFESSION_ART[artKey(category.name)];

export default function RiderLanding({firstName,onProfile,onLogout}:{firstName:string;onProfile:()=>void;onLogout:()=>void}){
  const router=useRouter(); const {width}=useWindowDimensions(); const compact=width<430; const [categories,setCategories]=useState(FALLBACK); const [pros,setPros]=useState<Professional[]>([]);
  useEffect(()=>{Promise.all([apiService.get('/jobs/categories').catch(()=>({categories:FALLBACK})),apiService.get('/jobs/professionals/available').catch(()=>({professionals:[]}))]).then(([c,p])=>{setCategories((c.categories||FALLBACK).slice(0,6));setPros((p.professionals||[]).slice(0,5));});},[]);
  const jobs=()=>router.push('/(jobs)/client-home');
  return <View style={s.root}><ScrollView style={s.screen} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
    <View pointerEvents="none" style={s.glowOne}/><View pointerEvents="none" style={s.glowTwo}/><Text pointerEvents="none" style={s.sparkle}>✦</Text>
    <View style={s.header}><View style={s.brand}><Text style={s.brandName}>moli</Text><Text style={s.brandSpark}>✦</Text></View><View style={s.actions}><ClientNotificationBell/><TouchableOpacity style={s.profile} onPress={onProfile}><Image source={PROFILE_ART[3]} style={s.headerAvatar} resizeMode="cover"/><View style={s.profileDot}/></TouchableOpacity></View></View>
    <Text style={s.greeting}>Hola, {firstName}</Text><Text style={[s.title,compact&&s.titleCompact]}>¿Qué necesitás{`\n`}resolver hoy?</Text>
    <TouchableOpacity style={s.search} onPress={jobs}><Ionicons name="search" size={27} color="#949494"/><Text style={s.searchText}>Buscá un profesional o servicio</Text><View style={s.searchButton}><Ionicons name="search" size={25} color="#fff"/></View></TouchableOpacity>
    <TouchableOpacity style={[s.hero,compact&&s.heroCompact]} onPress={jobs}><View style={s.heroShine}/><Text style={s.heroSparkOne}>✦</Text><Text style={s.heroSparkTwo}>✦</Text><View style={s.heroCopy}><Text style={[s.heroTitle,compact&&s.heroTitleCompact]}>Necesito un{`\n`}profesional</Text><Text style={[s.heroText,compact&&s.heroTextCompact]}>Contanos qué necesitás y{`\n`}encontrá ayuda confiable.</Text><View style={[s.heroButton,compact&&s.heroButtonCompact]}><Text style={s.heroButtonText}>PEDIR AHORA</Text><Ionicons name="chevron-forward" size={20} color={C.primaryDark}/></View></View><View style={[s.heroArt,compact&&s.heroArtCompact]}><Image source={VERIFIED_TOOLS} style={[s.heroImage,compact&&s.heroImageCompact]} resizeMode="contain"/></View></TouchableOpacity>
    <View style={s.carouselDots}><View style={s.dotActive}/><View style={s.dot}/><View style={s.dot}/></View>
    <Section title="Servicios populares" action="Ver todos"/><View style={s.grid}>{categories.map((c,i)=>{const artwork=categoryArt(c);return <TouchableOpacity activeOpacity={0.82} key={c.id||c.category_id||i} style={s.category} onPress={jobs}><View style={[s.categoryIcon,compact&&s.categoryIconCompact]}>{artwork?<Image source={artwork} style={[s.categoryImage,compact&&s.categoryImageCompact]} resizeMode="contain"/>:<Ionicons name={(c.icon||'grid') as any} size={27} color={C.primary}/>}<View style={s.categoryBadge}><Ionicons name={(c.icon||'sparkles') as any} size={13} color="#fff"/></View></View><Text style={s.categoryText} numberOfLines={1}>{c.name}</Text></TouchableOpacity>})}</View>
    <Section title="Disponibles ahora" action="VER TODOS  ›"/><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.proRow}>{(pros.length?pros:[{user_id:'nearby',name:'Profesional verificado',categories:['Servicios'],rating:5,total_jobs:128}]).map((p,index)=><TouchableOpacity activeOpacity={0.84} key={p.user_id} style={s.proCard} onPress={jobs}><View style={s.avatar}><Image source={PROFILE_ART[index%PROFILE_ART.length]} style={s.profileImage} resizeMode="cover"/><View style={s.available}/></View><View style={s.proInfo}><View style={s.verifiedRow}><Ionicons name="shield-checkmark" size={16} color={C.primary}/><Text style={s.verifiedText}>Profesional verificado</Text></View><Text style={s.proName} numberOfLines={1}>{p.name}</Text><View style={s.ratingRow}><Ionicons name="star" size={15} color="#FFB400"/><Text style={s.rating}>{(p.rating||5).toFixed(1)}</Text></View><Text style={s.jobsCount}>{p.total_jobs||128} trabajos</Text></View></TouchableOpacity>)}</ScrollView>
    <Text style={s.more}>También en Moli</Text><View style={s.utilityGrid}>
      <UtilityCard icon="document-text" artwork={PAPERWORK_ART} eyebrow="GESTIONES" title="Trámites" copy="Resolvé diligencias" onPress={()=>router.push({pathname:'/(jobs)/client-home',params:{service:'tramites'}})}/>
      <UtilityCard icon="car-sport" artwork={TRAVEL_ART} eyebrow="MOVILIDAD" title="Viajes" copy="Pedí auto o moto" onPress={()=>router.push('/(rider)/home')}/>
      <UtilityCard icon="storefront" artwork={MARKETPLACE_ART} eyebrow="COMPRAS" title="Market" copy="Delivery o retiro" onPress={()=>router.push('/(marketplace)')}/>
    </View>
    <TouchableOpacity style={s.logout} onPress={onLogout}><Ionicons name="swap-horizontal" size={19} color={C.gray}/><Text style={s.logoutText}>Cambiar cuenta</Text></TouchableOpacity>
  </ScrollView><ClientActiveRequests/></View>;
}
function Section({title,action}:{title:string;action:string}){return <View style={s.section}><Text style={s.sectionTitle}>{title}</Text><Text style={s.sectionAction}>{action}</Text></View>}
function UtilityCard({icon,artwork,eyebrow,title,copy,onPress}:{icon:keyof typeof Ionicons.glyphMap;artwork?:ImageSourcePropType;eyebrow:string;title:string;copy:string;onPress:()=>void}){return <TouchableOpacity activeOpacity={.84} style={s.utilityCard} onPress={onPress}><View style={[s.utilityIcon,artwork?s.utilityArtBox:undefined]}>{artwork?<Image source={artwork} style={s.utilityArt} resizeMode="contain"/>:<Ionicons name={icon} size={25} color="#fff"/>}</View><Text style={s.utilityEyebrow}>{eyebrow}</Text><Text style={s.utilityTitle}>{title}</Text><Text style={s.utilityCopy}>{copy}</Text><View style={s.utilityArrow}><Ionicons name="chevron-forward" size={14} color={C.primary}/></View></TouchableOpacity>}
const s=StyleSheet.create({
  root:{flex:1,backgroundColor:'#FFF8F2'},
  screen:{backgroundColor:'#FFF8F2'},
  content:{width:'100%',maxWidth:720,alignSelf:'center',paddingHorizontal:20,paddingBottom:46,backgroundColor:'#FFF8F2',overflow:'hidden'},
  glowOne:{position:'absolute',width:350,height:350,borderRadius:175,backgroundColor:'#FFF0E3',top:80,right:-170,opacity:.72},
  glowTwo:{position:'absolute',width:220,height:220,borderRadius:110,borderWidth:24,borderColor:'#FFF1E5',top:210,left:-145,opacity:.78},
  sparkle:{position:'absolute',right:34,top:185,color:'#FFD9BD',fontSize:35},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingTop:20,paddingBottom:31},
  brand:{flexDirection:'row',alignItems:'flex-start'},
  brandName:{fontSize:38,fontWeight:'900',color:C.primary,letterSpacing:-2.4,lineHeight:40},
  brandSpark:{color:C.primary,fontSize:17,fontWeight:'900',marginLeft:1,marginTop:-4},
  actions:{flexDirection:'row',gap:12,alignItems:'center'},
  bell:{width:45,height:45,borderRadius:23,backgroundColor:'#fff',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#F4E8DE',...SH.md},
  notificationBadge:{position:'absolute',right:-2,top:-3,minWidth:18,height:18,borderRadius:9,backgroundColor:C.primary,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'#FFF8F2'},
  notificationText:{color:'#fff',fontSize:9,fontWeight:'900'},
  profile:{width:50,height:50,borderRadius:25,backgroundColor:'#fff',alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:C.primary,overflow:'visible',...SH.md},
  headerAvatar:{width:44,height:44,borderRadius:22},
  profileDot:{position:'absolute',right:-1,bottom:1,width:13,height:13,borderRadius:7,backgroundColor:C.primary,borderWidth:2,borderColor:'#fff'},
  greeting:{color:C.black,fontSize:18,fontWeight:'500',marginTop:1},
  title:{color:C.black,fontSize:41,lineHeight:43,fontWeight:'900',letterSpacing:-2,marginTop:7},
  titleCompact:{fontSize:35,lineHeight:38},
  search:{height:76,backgroundColor:'#fff',borderRadius:38,flexDirection:'row',alignItems:'center',gap:14,paddingLeft:24,paddingRight:8,marginTop:28,borderWidth:1,borderColor:'#F1E3D7',shadowColor:'#7E4828',shadowOffset:{width:0,height:10},shadowOpacity:.19,shadowRadius:18,elevation:10},
  searchText:{color:'#929292',fontSize:15,flex:1},
  searchButton:{width:60,height:60,borderRadius:30,backgroundColor:C.primary,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'#FF9A6C',borderBottomWidth:4,borderBottomColor:C.primaryDark,shadowColor:C.primaryDark,shadowOffset:{width:0,height:6},shadowOpacity:.38,shadowRadius:8,elevation:9},
  hero:{minHeight:245,backgroundColor:C.primary,borderRadius:29,padding:25,marginTop:29,flexDirection:'row',overflow:'hidden',borderWidth:2,borderColor:'#FF9A6C',borderBottomWidth:5,borderBottomColor:C.primaryDark,shadowColor:C.primaryDark,shadowOffset:{width:0,height:10},shadowOpacity:.34,shadowRadius:14,elevation:11},
  heroCompact:{minHeight:220,padding:18},
  heroShine:{position:'absolute',left:14,right:14,top:8,height:3,borderRadius:2,backgroundColor:'rgba(255,255,255,.5)'},
  heroSparkOne:{position:'absolute',color:'#FFE2C8',fontSize:24,right:140,top:78},
  heroSparkTwo:{position:'absolute',color:'#FFF4E8',fontSize:15,right:118,bottom:32},
  heroCopy:{flex:1,zIndex:2},
  heroTitle:{color:'#fff',fontSize:30,lineHeight:32,fontWeight:'900',letterSpacing:-.8,marginTop:5},
  heroTitleCompact:{fontSize:24,lineHeight:26},
  heroText:{color:'#FFF9F5',fontSize:14,lineHeight:20,marginTop:13},
  heroTextCompact:{fontSize:12,lineHeight:17},
  heroButton:{alignSelf:'flex-start',backgroundColor:'#fff',borderRadius:27,paddingHorizontal:21,paddingVertical:15,flexDirection:'row',alignItems:'center',gap:10,marginTop:21,shadowColor:'#A62D00',shadowOffset:{width:0,height:6},shadowOpacity:.32,shadowRadius:8,elevation:7,borderBottomWidth:4,borderBottomColor:'#E6D5CB'},
  heroButtonCompact:{paddingHorizontal:15,paddingVertical:12,marginTop:15},
  heroButtonText:{color:C.primaryDark,fontSize:13,fontWeight:'900',letterSpacing:.45},
  heroArt:{width:150,height:150,borderRadius:48,backgroundColor:'rgba(255,255,255,.10)',alignItems:'center',justifyContent:'center',alignSelf:'center',marginLeft:-10},
  heroImage:{width:158,height:158},
  heroArtCompact:{width:106,height:125,marginLeft:-12},
  heroImageCompact:{width:116,height:116},
  carouselDots:{height:24,marginTop:-12,alignSelf:'center',paddingHorizontal:18,backgroundColor:'#FFF8F2',borderTopLeftRadius:18,borderTopRightRadius:18,flexDirection:'row',alignItems:'center',gap:7,zIndex:4},
  dotActive:{width:19,height:8,borderRadius:4,backgroundColor:C.primary},
  dot:{width:8,height:8,borderRadius:4,backgroundColor:'#F0DCCE'},
  section:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:25,marginBottom:13},
  sectionTitle:{fontSize:20,fontWeight:'900',color:C.black,letterSpacing:-.35},
  sectionAction:{fontSize:10,fontWeight:'900',color:C.primaryDark,backgroundColor:'#fff',paddingHorizontal:12,paddingVertical:8,borderRadius:16,...SH.sm},
  grid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:13},
  category:{width:'31.5%',backgroundColor:'#fff',borderRadius:23,paddingTop:5,paddingBottom:12,alignItems:'center',borderWidth:1,borderColor:'#F0DFD1',borderBottomWidth:3,borderBottomColor:'#E9D8CA',shadowColor:'#6F4229',shadowOffset:{width:0,height:7},shadowOpacity:.17,shadowRadius:10,elevation:6},
  categoryIcon:{width:'100%',height:105,borderRadius:20,backgroundColor:'#FFF9F4',alignItems:'center',justifyContent:'flex-end',overflow:'hidden'},
  categoryImage:{width:104,height:104},
  categoryIconCompact:{height:91},
  categoryImageCompact:{width:91,height:91},
  categoryBadge:{position:'absolute',left:5,bottom:4,width:31,height:31,borderRadius:16,backgroundColor:C.primary,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'#fff',shadowColor:C.primaryDark,shadowOffset:{width:0,height:3},shadowOpacity:.3,shadowRadius:4,elevation:5},
  categoryText:{fontSize:13,fontWeight:'900',color:C.black,marginTop:7,width:'100%',textAlign:'center'},
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
  more:{fontSize:20,fontWeight:'900',color:C.black,marginTop:28,marginBottom:14},
  utilityGrid:{flexDirection:'row',gap:11},
  utilityCard:{flex:1,minHeight:150,backgroundColor:'#fff',borderRadius:22,padding:12,borderWidth:1,borderColor:'#F0DFD1',borderBottomWidth:3,borderBottomColor:'#E9D8CA',shadowColor:'#6F4229',shadowOffset:{width:0,height:6},shadowOpacity:.15,shadowRadius:9,elevation:5},
  utilityIcon:{width:49,height:49,borderRadius:17,backgroundColor:C.primary,alignItems:'center',justifyContent:'center',borderBottomWidth:3,borderBottomColor:C.primaryDark,shadowColor:C.primaryDark,shadowOffset:{width:0,height:4},shadowOpacity:.25,shadowRadius:5,elevation:5},
  utilityArtBox:{width:68,height:61,borderRadius:19,backgroundColor:'#FFF5ED',borderBottomColor:'#F0D4C2',overflow:'hidden'},
  utilityArt:{width:65,height:65},
  utilityEyebrow:{fontSize:8,fontWeight:'900',color:C.primary,letterSpacing:.65,marginTop:11},
  utilityTitle:{fontSize:15,fontWeight:'900',color:C.black,marginTop:2},
  utilityCopy:{fontSize:9,lineHeight:13,color:C.gray,marginTop:3},
  utilityArrow:{position:'absolute',right:9,top:13,width:25,height:25,borderRadius:13,backgroundColor:'#FFF2E9',alignItems:'center',justifyContent:'center'},
  logout:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,paddingVertical:24,marginTop:8},
  logoutText:{color:C.gray,fontSize:14,fontWeight:'700'}
});
