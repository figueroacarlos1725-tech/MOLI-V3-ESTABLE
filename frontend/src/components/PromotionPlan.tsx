import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
export type PromotionPlan = 'barter_30' | 'standard_15';
export function PromotionPlanChoice({ value, onChange }: { value: PromotionPlan; onChange: (plan: PromotionPlan) => void }) {
  return <View style={{gap:10}}><Text style={{fontWeight:'800',fontSize:16,color:'#17233B'}}>Elegí tu plan de viajes</Text>{([
    ['barter_30', 'Lanzamiento: 0% por 30 días', 'Desde el lanzamiento oficial: cubrís hasta 2 viajes promocionales por día, hasta $4.000 cada uno. El pasajero paga el excedente. Solo esos viajes completados generan crédito del 15% del importe cubierto para comisiones futuras.'],
    ['standard_15', 'Plan habitual: 15%', 'Comisión del 15% por viaje, sin compromiso de viajes promocionales.'],
  ] as const).map(([id,title,description])=><TouchableOpacity key={id} accessibilityRole="radio" accessibilityState={{checked:value===id}} onPress={()=>onChange(id)} style={{padding:16,borderRadius:14,borderWidth:2,borderColor:value===id?'#E85E1A':'#E5E7EB',backgroundColor:value===id?'#FFF3EB':'#fff',gap:7}}><Text style={{fontWeight:'800',color:'#17233B'}}>{value===id?'● ':'○ '}{title}</Text><Text style={{lineHeight:21,color:'#555'}}>{description}</Text></TouchableOpacity>)}<Text style={{fontSize:12,lineHeight:18,color:'#666'}}>La beta no consume los 30 días. Si te registrás después del lanzamiento, tus 30 días cuentan desde tu alta. La elección queda registrada y no puede cambiarse desde la app.</Text></View>;
}
