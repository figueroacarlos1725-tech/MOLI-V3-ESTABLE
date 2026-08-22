import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { apiService } from '@/src/services/api';
import { Merchant } from '@/src/marketplace/types';
import { useMarketCart } from '@/src/marketplace/CartContext';

export default function MarketplaceHome() {
  const router = useRouter();
  const cart = useMarketCart();
  const [items, setItems] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setError(''); const data = await apiService.get('/marketplace/merchants'); setItems(data.merchants || []); }
    catch (e) { setError(e instanceof Error ? e.message : 'No pudimos cargar los comercios'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return <SafeAreaView style={s.page}>
    <View style={s.header}><View><Text style={s.eyebrow}>MOLI MARKET</Text><Text style={s.title}>¿Qué necesitás hoy?</Text></View>
      <TouchableOpacity style={s.cart} onPress={() => router.push('/(marketplace)/cart')}><Ionicons name="bag-handle" size={22} color="#111" />
        {cart.count > 0 && <View style={s.count}><Text style={s.countText}>{cart.count}</Text></View>}</TouchableOpacity></View>
    <View style={s.delivery}><Ionicons name="location" size={18} color="#FF7733" /><View><Text style={s.deliveryLabel}>Entregar en</Text><Text style={s.deliveryText}>Tu ubicación actual</Text></View><Ionicons name="chevron-down" size={18} color="#666" /></View>
    <View style={s.promo}><View style={s.promoCopy}><Text style={s.promoEyebrow}>TODO CERCA. TODO MOLI.</Text><Text style={s.promoTitle}>Pedí lo que quieras</Text><Text style={s.promoText}>Priorizamos motos para que llegue más rápido.</Text></View><View style={s.promoIcon}><Ionicons name="bicycle" size={34} color="#0D0D0D" /></View></View>
    <View style={s.categories}><View style={s.categoryOn}><Ionicons name="sparkles" size={15} color="#0D0D0D"/><Text style={s.categoryOnText}>Para vos</Text></View><View style={s.category}><Ionicons name="restaurant-outline" size={15} color="#636366"/><Text style={s.categoryText}>Comidas</Text></View><View style={s.category}><Ionicons name="basket-outline" size={15} color="#636366"/><Text style={s.categoryText}>Tiendas</Text></View></View>
    <Text style={s.section}>Comercios cerca tuyo</Text>
    {loading ? <ActivityIndicator style={{ marginTop: 48 }} color="#FF7733" /> :
      <FlatList data={items} keyExtractor={(x) => x.merchant_id} contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        ListEmptyComponent={<View style={s.empty}><Ionicons name="storefront-outline" size={36} color="#999" /><Text style={s.emptyTitle}>{error || 'Todavía no hay comercios disponibles'}</Text><Text style={s.emptyCopy}>Probá de nuevo en unos minutos.</Text></View>}
        renderItem={({ item }) => <TouchableOpacity style={s.merchant} onPress={() => router.push({ pathname: '/(marketplace)/merchant', params: { id: item.merchant_id } })}>
          <View style={s.merchantArt}><Ionicons name="storefront" size={30} color="#FF7733" /></View><View style={{ flex: 1 }}><Text style={s.merchantName}>{item.name}</Text><Text style={s.meta} numberOfLines={1}>{item.description || item.address}</Text>
          <View style={s.tags}>{item.capabilities.pickup && <Text style={s.tag}>Retiro</Text>}{item.capabilities.delivery && <Text style={s.tag}>Delivery</Text>}</View></View><Ionicons name="chevron-forward" size={20} color="#AAA" /></TouchableOpacity>} />}
  </SafeAreaView>;
}

const s = StyleSheet.create({page:{flex:1,backgroundColor:'#F7F5F2'},header:{padding:20,paddingTop:14,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},eyebrow:{fontSize:11,fontWeight:'800',letterSpacing:1.5,color:'#FF7733'},title:{fontSize:27,fontWeight:'800',color:'#17191C',marginTop:3},cart:{width:48,height:48,borderRadius:16,backgroundColor:'#FFF',alignItems:'center',justifyContent:'center'},count:{position:'absolute',right:-3,top:-3,minWidth:20,height:20,borderRadius:10,backgroundColor:'#FF3B30',alignItems:'center',justifyContent:'center'},countText:{fontSize:11,fontWeight:'800',color:'#FFF'},delivery:{marginHorizontal:20,padding:14,borderRadius:16,backgroundColor:'#FFF',flexDirection:'row',alignItems:'center',gap:10},deliveryLabel:{fontSize:11,color:'#858A90'},deliveryText:{fontSize:14,fontWeight:'700',color:'#24272B'},promo:{margin:20,marginBottom:12,padding:20,borderRadius:24,backgroundColor:'#202124',flexDirection:'row',alignItems:'center',overflow:'hidden'},promoCopy:{flex:1},promoEyebrow:{fontSize:9,fontWeight:'900',letterSpacing:1.3,color:'#FF7733'},promoTitle:{fontSize:21,fontWeight:'900',color:'#FFF',marginTop:5},promoText:{fontSize:12,color:'#AEBAB4',lineHeight:17,marginTop:5},promoIcon:{width:64,height:64,borderRadius:22,backgroundColor:'#FF7733',alignItems:'center',justifyContent:'center'},categories:{flexDirection:'row',paddingHorizontal:20,gap:8},category:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:13,paddingVertical:9,borderRadius:18,backgroundColor:'#FFF'},categoryOn:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:13,paddingVertical:9,borderRadius:18,backgroundColor:'#FFD8CF'},categoryText:{fontSize:12,fontWeight:'700',color:'#636366'},categoryOnText:{fontSize:12,fontWeight:'800',color:'#0D0D0D'},section:{fontSize:18,fontWeight:'800',color:'#17191C',margin:20,marginBottom:10},list:{paddingHorizontal:20,paddingBottom:30,gap:12},merchant:{padding:14,borderRadius:18,backgroundColor:'#FFF',flexDirection:'row',alignItems:'center',gap:13},merchantArt:{width:62,height:62,borderRadius:17,backgroundColor:'#FFF0EC',alignItems:'center',justifyContent:'center'},merchantName:{fontSize:16,fontWeight:'800',color:'#202226'},meta:{fontSize:12,color:'#7C8188',marginTop:3},tags:{flexDirection:'row',gap:6,marginTop:7},tag:{fontSize:10,fontWeight:'700',color:'#D84229',backgroundColor:'#FFF0EC',paddingHorizontal:8,paddingVertical:3,borderRadius:10},empty:{alignItems:'center',padding:45},emptyTitle:{fontSize:16,fontWeight:'700',textAlign:'center',marginTop:12,color:'#555'},emptyCopy:{fontSize:13,color:'#999',marginTop:5}});
