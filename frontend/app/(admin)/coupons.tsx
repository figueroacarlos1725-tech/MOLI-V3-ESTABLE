import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/src/services/api';
import { confirmAlert } from '@/src/utils/alert';

interface Coupon {
  coupon_id: string; code: string; discount_type: string;
  discount_value: number; max_uses: number; current_uses: number;
  min_fare: number; max_discount: number;
  valid_from?: string; valid_until?: string;
  active: boolean; description: string;
}

export default function AdminCouponsScreen() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string|null>(null);
  const [form, setForm] = useState({
    code:'',discount_type:'percentage',discount_value:'10',
    max_uses:'100',min_fare:'0',max_discount:'0',
    description:'',active:true,valid_until:''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchCoupons(); }, []);

  const fetchCoupons = async () => {
    try {
      const r = await apiService.get('/admin/coupons');
      setCoupons(r.coupons || []);
    } catch (e) {} finally { setLoading(false); }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({code:'',discount_type:'percentage',discount_value:'10',max_uses:'100',min_fare:'0',max_discount:'0',description:'',active:true,valid_until:''});
    setShowModal(true);
  };

  const openEdit = (c: Coupon) => {
    setEditingId(c.coupon_id);
    setForm({
      code:c.code,discount_type:c.discount_type,
      discount_value:String(c.discount_value),max_uses:String(c.max_uses),
      min_fare:String(c.min_fare),max_discount:String(c.max_discount),
      description:c.description,active:c.active,valid_until:c.valid_until||''
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.code) return;
    setSaving(true);
    try {
      const body = {
        code:form.code,discount_type:form.discount_type,
        discount_value:parseFloat(form.discount_value)||0,
        max_uses:parseInt(form.max_uses)||100,
        min_fare:parseFloat(form.min_fare)||0,
        max_discount:parseFloat(form.max_discount)||0,
        description:form.description,active:form.active,
        valid_until:form.valid_until||null
      };
      if (editingId) {
        await apiService.put(`/admin/coupons/${editingId}`, body);
      } else {
        await apiService.post('/admin/coupons', body);
      }
      setShowModal(false);
      fetchCoupons();
    } catch (e) {} finally { setSaving(false); }
  };

  const handleDelete = (id: string, code: string) => {
    confirmAlert('Eliminar cupón', `¿Eliminar el cupón ${code}?`, async () => {
      await apiService.delete(`/admin/coupons/${id}`);
      fetchCoupons();
    }, 'Eliminar');
  };

  if (loading) return <SafeAreaView style={s.container}><ActivityIndicator size="large" color="#8E44AD" style={{marginTop:40}} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Cupones de Descuento</Text>
        <TouchableOpacity style={s.addBtn} onPress={openCreate}>
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={s.addBtnText}>Nuevo</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.list}>
        {coupons.length === 0 && <Text style={s.empty}>No hay cupones creados</Text>}
        {coupons.map(c => (
          <View key={c.coupon_id} style={s.card}>
            <View style={s.cardTop}>
              <View style={s.codeBox}>
                <Text style={s.codeText}>{c.code}</Text>
              </View>
              <View style={{flex:1,marginLeft:12}}>
                <Text style={s.discountText}>
                  {c.discount_type==='percentage'?`${c.discount_value}% OFF`:`$${c.discount_value} OFF`}
                </Text>
                <Text style={s.descText}>{c.description}</Text>
              </View>
              <View style={[s.statusDot, c.active?s.statusActive:s.statusInactive]} />
            </View>
            <View style={s.cardStats}>
              <Text style={s.stat}>Usos: {c.current_uses}/{c.max_uses}</Text>
              {c.min_fare > 0 && <Text style={s.stat}>Min: ${c.min_fare}</Text>}
              {c.max_discount > 0 && <Text style={s.stat}>Máx desc: ${c.max_discount}</Text>}
            </View>
            <View style={s.cardActions}>
              <TouchableOpacity style={s.editBtn} onPress={() => openEdit(c)}>
                <Ionicons name="pencil" size={16} color="#8E44AD" />
                <Text style={s.editBtnText}>Editar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.deleteBtn} onPress={() => handleDelete(c.coupon_id, c.code)}>
                <Ionicons name="trash" size={16} color="#EF4444" />
                <Text style={s.deleteBtnText}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
        <View style={{height:40}} />
      </ScrollView>

      <Modal visible={showModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={s.modalTitle}>{editingId?'Editar':'Crear'} Cupón</Text>
              <TextInput style={s.input} value={form.code} onChangeText={v => setForm({...form,code:v.toUpperCase()})} placeholder="Código (ej: MOLI20)" autoCapitalize="characters" />
              <Text style={s.label}>Tipo de descuento</Text>
              <View style={s.radioRow}>
                <TouchableOpacity style={[s.radioBtn,form.discount_type==='percentage'&&s.radioBtnActive]} onPress={() => setForm({...form,discount_type:'percentage'})}>
                  <Text style={[s.radioBtnText,form.discount_type==='percentage'&&s.radioBtnTextActive]}>Porcentaje %</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.radioBtn,form.discount_type==='fixed'&&s.radioBtnActive]} onPress={() => setForm({...form,discount_type:'fixed'})}>
                  <Text style={[s.radioBtnText,form.discount_type==='fixed'&&s.radioBtnTextActive]}>Monto fijo $</Text>
                </TouchableOpacity>
              </View>
              <TextInput style={s.input} value={form.discount_value} onChangeText={v => setForm({...form,discount_value:v})} placeholder="Valor descuento" keyboardType="numeric" />
              <TextInput style={s.input} value={form.max_uses} onChangeText={v => setForm({...form,max_uses:v})} placeholder="Máx usos" keyboardType="numeric" />
              <TextInput style={s.input} value={form.min_fare} onChangeText={v => setForm({...form,min_fare:v})} placeholder="Tarifa mínima para usar" keyboardType="numeric" />
              <TextInput style={s.input} value={form.max_discount} onChangeText={v => setForm({...form,max_discount:v})} placeholder="Descuento máximo (0=sin límite)" keyboardType="numeric" />
              <TextInput style={s.input} value={form.description} onChangeText={v => setForm({...form,description:v})} placeholder="Descripción" />
              <View style={s.switchRow}>
                <Text style={s.switchLabel}>Activo</Text>
                <Switch value={form.active} onValueChange={v => setForm({...form,active:v})} trackColor={{true:'#8E44AD'}} />
              </View>
              <View style={{flexDirection:'row',gap:10,marginTop:16}}>
                <TouchableOpacity style={[s.btn,s.btnCancel]} onPress={() => setShowModal(false)}>
                  <Text style={s.btnCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn,s.btnSave]} onPress={handleSave} disabled={saving}>
                  <Text style={s.btnSaveText}>{saving?'Guardando...':'Guardar'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:'#F2F2F7'},
  header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:16,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#E5E5EA'},
  title:{fontSize:24,fontWeight:'bold',color:'#1C1C1E'},
  addBtn:{flexDirection:'row',alignItems:'center',backgroundColor:'#8E44AD',paddingHorizontal:14,paddingVertical:8,borderRadius:8,gap:4},
  addBtnText:{color:'#fff',fontWeight:'600',fontSize:14},
  list:{padding:12,gap:12},
  empty:{textAlign:'center',color:'#8E8E93',marginTop:40,fontSize:16},
  card:{backgroundColor:'#fff',borderRadius:14,padding:14},
  cardTop:{flexDirection:'row',alignItems:'center'},
  codeBox:{backgroundColor:'#F3E8FF',paddingHorizontal:14,paddingVertical:8,borderRadius:8,borderWidth:2,borderColor:'#8E44AD',borderStyle:'dashed'},
  codeText:{fontSize:16,fontWeight:'800',color:'#8E44AD',letterSpacing:1},
  discountText:{fontSize:18,fontWeight:'700',color:'#1C1C1E'},
  descText:{fontSize:13,color:'#8E8E93'},
  statusDot:{width:12,height:12,borderRadius:6},
  statusActive:{backgroundColor:'#10B981'},statusInactive:{backgroundColor:'#EF4444'},
  cardStats:{flexDirection:'row',gap:16,marginTop:10,paddingTop:10,borderTopWidth:1,borderTopColor:'#F2F2F7'},
  stat:{fontSize:12,color:'#8E8E93',fontWeight:'600'},
  cardActions:{flexDirection:'row',gap:12,marginTop:10,justifyContent:'flex-end'},
  editBtn:{flexDirection:'row',alignItems:'center',gap:4},editBtnText:{color:'#8E44AD',fontSize:13,fontWeight:'600'},
  deleteBtn:{flexDirection:'row',alignItems:'center',gap:4},deleteBtnText:{color:'#EF4444',fontSize:13,fontWeight:'600'},
  modalOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'center',alignItems:'center',padding:16},
  modalContent:{backgroundColor:'#fff',borderRadius:16,padding:20,width:'100%',maxWidth:450,maxHeight:'85%'},
  modalTitle:{fontSize:20,fontWeight:'bold',color:'#1C1C1E',marginBottom:16},
  input:{backgroundColor:'#F9FAFB',borderWidth:1,borderColor:'#E5E5EA',borderRadius:8,paddingHorizontal:12,paddingVertical:10,fontSize:15,marginBottom:10},
  label:{fontSize:12,fontWeight:'600',color:'#666',marginBottom:6},
  radioRow:{flexDirection:'row',gap:8,marginBottom:12},
  radioBtn:{paddingHorizontal:14,paddingVertical:8,borderRadius:8,backgroundColor:'#E5E5EA'},
  radioBtnActive:{backgroundColor:'#8E44AD'},
  radioBtnText:{fontSize:13,fontWeight:'600',color:'#666'},radioBtnTextActive:{color:'#fff'},
  switchRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:8},
  switchLabel:{fontSize:14,color:'#1C1C1E'},
  btn:{flex:1,paddingVertical:12,borderRadius:8,alignItems:'center'},
  btnCancel:{backgroundColor:'#F2F2F7'},btnSave:{backgroundColor:'#8E44AD'},
  btnCancelText:{color:'#666',fontWeight:'600'},btnSaveText:{color:'#fff',fontWeight:'700'},
});
