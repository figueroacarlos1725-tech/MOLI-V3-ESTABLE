import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/src/services/api';

interface Fare {
  vehicle_type: string;
  base_fare: number; per_km: number; per_min: number; min_fare: number;
  multiplier: number; dynamic_pricing: boolean; dynamic_multiplier: number;
  night_surcharge: number; night_start_hour: number; night_end_hour: number;
  day_surcharge: number;
}

const TYPE_NAMES: Record<string,string> = {economy:'Auto',moto:'Moto',comfort:'Confort',premium:'Premium',xl:'XL'};
const TYPE_ICONS: Record<string,string> = {economy:'car-outline',moto:'bicycle',comfort:'car',premium:'car-sport',xl:'bus'};

export default function AdminFaresScreen() {
  const [fares, setFares] = useState<Fare[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string|null>(null);
  const [editData, setEditData] = useState<Partial<Fare>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchFares(); }, []);

  const fetchFares = async () => {
    try {
      const r = await apiService.get('/admin/fares');
      setFares(r.fares || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleEdit = (f: Fare) => {
    setEditing(f.vehicle_type);
    setEditData({...f});
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await apiService.put(`/admin/fares/${editing}`, editData);
      setEditing(null);
      fetchFares();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  const Field = ({label, field, suffix}: {label:string, field:keyof Fare, suffix?:string}) => (
    <View style={s.fieldRow}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={s.fieldInputRow}>
        <TextInput
          style={s.fieldInput}
          value={String(editData[field] ?? '')}
          onChangeText={v => setEditData({...editData, [field]: parseFloat(v) || 0})}
          keyboardType="numeric"
        />
        {suffix && <Text style={s.fieldSuffix}>{suffix}</Text>}
      </View>
    </View>
  );

  if (loading) return <SafeAreaView style={s.container}><ActivityIndicator size="large" color="#E85E1A" style={{marginTop:40}} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Configuración de Tarifas</Text>
      </View>
      <ScrollView contentContainerStyle={s.list}>
        {fares.map(f => (
          <View key={f.vehicle_type} style={s.card}>
            <View style={s.cardHeader}>
              <Ionicons name={TYPE_ICONS[f.vehicle_type] as any} size={22} color="#E85E1A" />
              <Text style={s.cardTitle}>{TYPE_NAMES[f.vehicle_type] || f.vehicle_type}</Text>
              <Text style={s.multiplierBadge}>x{f.multiplier}</Text>
              {editing !== f.vehicle_type && (
                <TouchableOpacity onPress={() => handleEdit(f)}>
                  <Ionicons name="pencil" size={18} color="#E85E1A" />
                </TouchableOpacity>
              )}
            </View>

            {editing === f.vehicle_type ? (
              <View style={s.editSection}>
                <Field label="Tarifa base" field="base_fare" suffix="$" />
                <Field label="Por kilómetro" field="per_km" suffix="$/km" />
                <Field label="Por minuto" field="per_min" suffix="$/min" />
                <Field label="Tarifa mínima" field="min_fare" suffix="$" />
                <Field label="Multiplicador" field="multiplier" suffix="x" />

                <View style={s.divider} />
                <Text style={s.subsectionTitle}>Tarifa Dinámica</Text>
                <View style={s.switchRow}>
                  <Text style={s.switchLabel}>Activar</Text>
                  <Switch
                    value={editData.dynamic_pricing || false}
                    onValueChange={v => setEditData({...editData, dynamic_pricing: v})}
                    trackColor={{true:'#E85E1A'}}
                  />
                </View>
                {editData.dynamic_pricing && <Field label="Multiplicador dinámico" field="dynamic_multiplier" suffix="x" />}

                <View style={s.divider} />
                <Text style={s.subsectionTitle}>Recargos</Text>
                <Field label="Recargo nocturno" field="night_surcharge" suffix="$" />
                <View style={{flexDirection:'row',gap:10}}>
                  <View style={{flex:1}}><Field label="Noche desde (hora)" field="night_start_hour" /></View>
                  <View style={{flex:1}}><Field label="Noche hasta (hora)" field="night_end_hour" /></View>
                </View>
                <Field label="Recargo diurno" field="day_surcharge" suffix="$" />

                <View style={s.editBtns}>
                  <TouchableOpacity style={[s.btn,s.btnCancel]} onPress={() => setEditing(null)}>
                    <Text style={s.btnCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.btn,s.btnSave]} onPress={handleSave} disabled={saving}>
                    <Text style={s.btnSaveText}>{saving?'Guardando...':'Guardar'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={s.infoGrid}>
                <View style={s.infoItem}><Text style={s.infoLabel}>Base</Text><Text style={s.infoValue}>${f.base_fare}</Text></View>
                <View style={s.infoItem}><Text style={s.infoLabel}>$/km</Text><Text style={s.infoValue}>${f.per_km}</Text></View>
                <View style={s.infoItem}><Text style={s.infoLabel}>$/min</Text><Text style={s.infoValue}>${f.per_min}</Text></View>
                <View style={s.infoItem}><Text style={s.infoLabel}>Mínima</Text><Text style={s.infoValue}>${f.min_fare}</Text></View>
                {f.dynamic_pricing && <View style={s.infoItem}><Text style={s.infoLabel}>Dinámica</Text><Text style={[s.infoValue,{color:'#F59E0B'}]}>x{f.dynamic_multiplier}</Text></View>}
                {f.night_surcharge > 0 && <View style={s.infoItem}><Text style={s.infoLabel}>Nocturno</Text><Text style={s.infoValue}>+${f.night_surcharge}</Text></View>}
              </View>
            )}
          </View>
        ))}
        <View style={{height:40}} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:'#F2F2F7'},
  header:{padding:16,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#E5E5EA'},
  title:{fontSize:24,fontWeight:'bold',color:'#1C1C1E'},
  list:{padding:12,gap:12},
  card:{backgroundColor:'#fff',borderRadius:14,overflow:'hidden'},
  cardHeader:{flexDirection:'row',alignItems:'center',padding:14,gap:10,borderBottomWidth:1,borderBottomColor:'#F2F2F7'},
  cardTitle:{fontSize:18,fontWeight:'700',color:'#1C1C1E',flex:1},
  multiplierBadge:{backgroundColor:'#FFF0EC',paddingHorizontal:10,paddingVertical:3,borderRadius:10,fontSize:12,fontWeight:'700',color:'#E85E1A',marginRight:8},
  infoGrid:{flexDirection:'row',flexWrap:'wrap',padding:14,gap:12},
  infoItem:{width:'30%',minWidth:80},
  infoLabel:{fontSize:11,color:'#8E8E93',fontWeight:'600'},
  infoValue:{fontSize:16,fontWeight:'700',color:'#1C1C1E'},
  editSection:{padding:14},
  fieldRow:{marginBottom:10},
  fieldLabel:{fontSize:12,fontWeight:'600',color:'#666',marginBottom:4},
  fieldInputRow:{flexDirection:'row',alignItems:'center'},
  fieldInput:{flex:1,backgroundColor:'#F9FAFB',borderWidth:1,borderColor:'#E5E5EA',borderRadius:8,paddingHorizontal:12,paddingVertical:8,fontSize:15},
  fieldSuffix:{fontSize:13,color:'#8E8E93',marginLeft:8,fontWeight:'600'},
  divider:{height:1,backgroundColor:'#E5E5EA',marginVertical:14},
  subsectionTitle:{fontSize:13,fontWeight:'700',color:'#E85E1A',marginBottom:10},
  switchRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:10},
  switchLabel:{fontSize:14,color:'#1C1C1E'},
  editBtns:{flexDirection:'row',gap:10,marginTop:14},
  btn:{flex:1,paddingVertical:12,borderRadius:8,alignItems:'center'},
  btnCancel:{backgroundColor:'#F2F2F7'},btnSave:{backgroundColor:'#E85E1A'},
  btnCancelText:{color:'#666',fontWeight:'600'},btnSaveText:{color:'#fff',fontWeight:'700'},
});
