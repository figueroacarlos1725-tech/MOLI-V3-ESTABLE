import React,{useEffect} from 'react';
import {Dimensions,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import Animated,{Easing,interpolate,useAnimatedStyle,useSharedValue,withDelay,withRepeat,withSequence,withSpring,withTiming} from 'react-native-reanimated';

const {width}=Dimensions.get('window');
const ORANGE='#FF5A1F',INK='#17181C',CREAM='#FFF9F3';

export default function AnimatedSplash({onFinish}:{onFinish:()=>void}){
 const enter=useSharedValue(0),shield=useSharedValue(.72),glow=useSharedValue(0),icons=useSharedValue(0),copy=useSharedValue(0),loading=useSharedValue(0),exit=useSharedValue(1);
 useEffect(()=>{
  enter.value=withSpring(1,{damping:15,stiffness:105});
  shield.value=withDelay(120,withSpring(1,{damping:13,stiffness:95}));
  glow.value=withDelay(450,withRepeat(withSequence(withTiming(1,{duration:850,easing:Easing.inOut(Easing.quad)}),withTiming(0,{duration:850,easing:Easing.inOut(Easing.quad)})),-1,true));
  icons.value=withDelay(700,withTiming(1,{duration:650,easing:Easing.out(Easing.cubic)}));
  copy.value=withDelay(1000,withTiming(1,{duration:520}));
  loading.value=withDelay(350,withTiming(1,{duration:2100,easing:Easing.inOut(Easing.cubic)}));
  const timer=setTimeout(()=>{exit.value=withTiming(0,{duration:330});setTimeout(onFinish,350)},2800);
  return()=>clearTimeout(timer);
 },[]);
 const containerStyle=useAnimatedStyle(()=>({opacity:exit.value}));
 const logoStyle=useAnimatedStyle(()=>({opacity:enter.value,transform:[{scale:interpolate(enter.value,[0,1],[.84,1])},{translateY:interpolate(enter.value,[0,1],[18,0])}]}));
 const shieldStyle=useAnimatedStyle(()=>({opacity:interpolate(shield.value,[.72,1],[0,.18]),transform:[{scale:shield.value}]}));
 const glowStyle=useAnimatedStyle(()=>({opacity:interpolate(glow.value,[0,1],[.16,.48]),transform:[{scale:interpolate(glow.value,[0,1],[.9,1.15])}]}));
 const iconsStyle=useAnimatedStyle(()=>({opacity:icons.value,transform:[{translateY:interpolate(icons.value,[0,1],[16,0])}]}));
 const copyStyle=useAnimatedStyle(()=>({opacity:copy.value,transform:[{translateY:interpolate(copy.value,[0,1],[10,0])}]}));
 const loadStyle=useAnimatedStyle(()=>({width:interpolate(loading.value,[0,1],[22,Math.min(width*.52,260)])}));
 return <Animated.View style={[s.page,containerStyle]}>
  <View style={s.topGlow}/><Animated.View style={[s.logoGlow,glowStyle]}/>
  <Animated.View style={[s.shield,shieldStyle]}><Ionicons name="shield-checkmark" size={132} color={ORANGE}/><Ionicons name="construct" size={66} color={ORANGE} style={s.wrench}/></Animated.View>
  <Animated.View style={[s.logoWrap,logoStyle]}><View style={s.logoLine}><Text style={s.logo}>Moli</Text><Text style={s.sparkle}>✦</Text></View></Animated.View>
  <Animated.View style={[s.modules,iconsStyle]}>
   <ModuleIcon name="construct"/><Dots/><ModuleIcon name="folder-open"/><Dots/><ModuleIcon name="car-sport"/>
  </Animated.View>
  <Animated.View style={[s.copy,copyStyle]}><Text style={s.tagline}>Movete. Resolvé. Avanzá.</Text><Text style={s.subline}>Todo en un solo lugar</Text></Animated.View>
  <View style={s.loadingTrack}><Animated.View style={[s.loadingFill,loadStyle]}/></View>
 </Animated.View>
}
function ModuleIcon({name}:{name:React.ComponentProps<typeof Ionicons>['name']}){return <View style={s.moduleIcon}><Ionicons name={name} size={25} color={ORANGE}/>{name==='construct'&&<View style={s.check}><Ionicons name="checkmark" size={9} color="#FFF"/></View>}</View>}
function Dots(){return <View style={s.dots}>{[0,1,2,3].map(i=><View key={i} style={[s.dot,{opacity:.35+i*.14}]}/>)}</View>}
const s=StyleSheet.create({
 page:{...StyleSheet.absoluteFillObject,zIndex:9999,backgroundColor:CREAM,alignItems:'center',justifyContent:'center',overflow:'hidden'},
 topGlow:{position:'absolute',top:'12%',width:360,height:360,borderRadius:180,backgroundColor:'rgba(255,190,112,.09)'},
 logoGlow:{position:'absolute',top:'27%',width:250,height:250,borderRadius:125,backgroundColor:'rgba(255,161,77,.22)'},
 shield:{position:'absolute',top:'22%',width:210,height:190,alignItems:'center',justifyContent:'center'},
 wrench:{position:'absolute',right:19,bottom:25,transform:[{rotate:'-18deg'}]},
 logoWrap:{marginTop:-45,alignItems:'center'},
 logoLine:{flexDirection:'row',alignItems:'flex-start'},
 logo:{fontSize:76,lineHeight:86,fontWeight:'900',letterSpacing:-4,color:ORANGE},
 sparkle:{fontSize:27,lineHeight:35,color:ORANGE,marginLeft:3,marginTop:2},
 modules:{position:'absolute',top:'61%',flexDirection:'row',alignItems:'center'},
 moduleIcon:{width:66,height:66,borderRadius:21,backgroundColor:'#FFFDF9',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#F5E9DD',shadowColor:'#6A3A18',shadowOffset:{width:0,height:7},shadowOpacity:.12,shadowRadius:12,elevation:5},
 check:{position:'absolute',right:10,bottom:9,width:16,height:16,borderRadius:8,backgroundColor:ORANGE,alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'#FFF'},
 dots:{width:54,flexDirection:'row',justifyContent:'space-evenly',alignItems:'center'},
 dot:{width:4,height:4,borderRadius:2,backgroundColor:ORANGE},
 copy:{position:'absolute',top:'76%',alignItems:'center'},
 tagline:{fontSize:22,fontWeight:'900',letterSpacing:-.6,color:INK},
 subline:{fontSize:14,color:'#A0978E',marginTop:8},
 loadingTrack:{position:'absolute',bottom:'9%',width:Math.min(width*.52,260),height:7,borderRadius:8,backgroundColor:'#EEE3D7',overflow:'hidden'},
 loadingFill:{height:'100%',borderRadius:8,backgroundColor:ORANGE,shadowColor:ORANGE,shadowOpacity:.6,shadowRadius:8},
});
