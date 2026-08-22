import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type VehicleKind = 'car' | 'moto' | 'taxi' | 'delivery' | 'package';
type Props = { kind: VehicleKind; size?: number; color?: string; backgroundColor?: string; selected?: boolean };
const glyph: Record<VehicleKind, React.ComponentProps<typeof Ionicons>['name']> = { car: 'car-sport', moto: 'bicycle', taxi: 'car', delivery: 'fast-food', package: 'cube' };

export default function VehicleIcon({ kind, size=54, color='#202124', backgroundColor='#F5F1EE', selected=false }:Props){
  return <View style={[s.wrap,{width:size,height:size,borderRadius:size*.32,backgroundColor},selected&&s.selected]}>
    {kind==='taxi'&&<View style={[s.taxiCap,{top:size*.16}]} />}
    <Ionicons name={glyph[kind]} size={size*.5} color={selected?'#FFFFFF':color}/>
    {kind==='taxi'&&<Text style={[s.taxi,{fontSize:size*.105},selected&&{color:'#FFFFFF'}]}>TAXI</Text>}
  </View>;
}
const s=StyleSheet.create({wrap:{alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'rgba(32,33,36,.06)'},selected:{backgroundColor:'#FF7733',borderColor:'#FF7733'},taxiCap:{position:'absolute',width:'25%',height:3,borderRadius:2,backgroundColor:'#FFB020'},taxi:{position:'absolute',bottom:4,fontWeight:'900',letterSpacing:.3,color:'#202124'}});
