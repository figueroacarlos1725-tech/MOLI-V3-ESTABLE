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
    <View style={s.delivery}><Ionicons name="location" size={18} color="#00A86B" /><View><Text style={s.deliveryLabel}>Entregar en</Text><Text style={s.deliveryText}>Tu ubicación actual</Text></View><Ionicons name="chevron-down" size={18} color="#666" /></View>
    <Text style={s.section}>Comercios cerca tuyo</Text>
    {loading ? <ActivityIndicator style={{ marginTop: 48 }} color="#00A86B" /> :
      <FlatList data={items} keyExtractor={(x) => x.merchant_id} contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        ListEmptyComponent={<View style={s.empty}><Ionicons name="storefront-outline" size={36} color="#999" /><Text style={s.emptyTitle}>{error || 'Todavía no hay comercios disponibles'}</Text><Text style={s.emptyCopy}>Probá de nuevo en unos minutos.</Text></View>}
        renderItem={({ item }) => <TouchableOpacity style={s.merchant} onPress={() => router.push({ pathname: '/(marketplace)/merchant', params: { id: item.merchant_id } })}>
          <View style={s.merchantArt}><Ionicons name="storefront" size={30} color="#00A86B" /></View><View style={{ flex: 1 }}><Text style={s.merchantName}>{item.name}</Text><Text style={s.meta} numberOfLines={1}>{item.description || item.address}</Text>
          <View style={s.tags}>{item.capabilities.pickup && <Text style={s.tag}>Retiro</Text>}{item.capabilities.delivery && <Text style={s.tag}>Delivery</Text>}</View></View><Ionicons name="chevron-forward" size={20} color="#AAA" /></TouchableOpacity>} />}
  </SafeAreaView>;
}

const s = StyleSheet.create({page:{flex:1,backgroundColor:'#F6F7F8'},header:{padding:20,paddingTop:14,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},eyebrow:{fontSize:11,fontWeight:'800',letterSpacing:1.5,color:'#00A86B'},title:{fontSize:27,fontWeight:'800',color:'#17191C',marginTop:3},cart:{width:48,height:48,borderRadius:16,backgroundColor:'#FFF',alignItems:'center',justifyContent:'center'},count:{position:'absolute',right:-3,top:-3,minWidth:20,height:20,borderRadius:10,backgroundColor:'#FF3B30',alignItems:'center',justifyContent:'center'},countText:{fontSize:11,fontWeight:'800',color:'#FFF'},delivery:{marginHorizontal:20,padding:14,borderRadius:16,backgroundColor:'#FFF',flexDirection:'row',alignItems:'center',gap:10},deliveryLabel:{fontSize:11,color:'#858A90'},deliveryText:{fontSize:14,fontWeight:'700',color:'#24272B'},section:{fontSize:18,fontWeight:'800',color:'#17191C',margin:20,marginBottom:10},list:{paddingHorizontal:20,paddingBottom:30,gap:12},merchant:{padding:14,borderRadius:18,backgroundColor:'#FFF',flexDirection:'row',alignItems:'center',gap:13},merchantArt:{width:62,height:62,borderRadius:17,backgroundColor:'#E8F8F1',alignItems:'center',justifyContent:'center'},merchantName:{fontSize:16,fontWeight:'800',color:'#202226'},meta:{fontSize:12,color:'#7C8188',marginTop:3},tags:{flexDirection:'row',gap:6,marginTop:7},tag:{fontSize:10,fontWeight:'700',color:'#007A4D',backgroundColor:'#E8F8F1',paddingHorizontal:8,paddingVertical:3,borderRadius:10},empty:{alignItems:'center',padding:45},emptyTitle:{fontSize:16,fontWeight:'700',textAlign:'center',marginTop:12,color:'#555'},emptyCopy:{fontSize:13,color:'#999',marginTop:5}});
