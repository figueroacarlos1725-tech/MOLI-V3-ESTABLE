import { operatorAlert } from '@/src/components/OperatorAlert';
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/src/services/api';

export default function AdminPaymentsScreen() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mpEnabled, setMpEnabled] = useState(false);
  const [mpPublicKey, setMpPublicKey] = useState('');
  const [mpAccessToken, setMpAccessToken] = useState('');
  const [apEnabled, setApEnabled] = useState(false);
  const [apApiKey, setApApiKey] = useState('');
  const [apSecret, setApSecret] = useState('');
  const [marketPolicy, setMarketPolicy] = useState<'driver_only'|'driver_and_merchant'>('driver_only');
  const [driverRate, setDriverRate] = useState('15');
  const [merchantRate, setMerchantRate] = useState('0');
  const [driverMinimum, setDriverMinimum] = useState('0');
  const [merchantMinimum, setMerchantMinimum] = useState('0');

  useEffect(() => { fetchConfig(); }, []);

  const fetchConfig = async () => {
    try {
      const [r, market] = await Promise.all([
        apiService.get('/admin/payment-config'),
        apiService.get('/marketplace/admin/commission-rules'),
      ]);
      setConfig(r);
      setMpEnabled(r.mercadopago_enabled || false);
      setMpPublicKey(r.mercadopago_public_key || '');
      setApEnabled(r.astropay_enabled || false);
      const driver = market.rules?.driver;
      const merchant = market.rules?.merchant;
      if (driver) { setDriverRate(String(driver.rate_percent || 0)); setDriverMinimum(String(Math.round((driver.min_cents || 0) / 100))); }
      if (merchant) { setMerchantRate(String(merchant.rate_percent || 0)); setMerchantMinimum(String(Math.round((merchant.min_cents || 0) / 100))); }
      setMarketPolicy(merchant?.active ? 'driver_and_merchant' : 'driver_only');
    } catch (e:any) { operatorAlert('No se pudo completar', e.message || 'Revisá la conexión e intentá nuevamente.'); } finally { setLoading(false); }
  };

  const saveMarketplaceCommissions = async () => {
    const driver = Number(driverRate), merchant = Number(merchantRate);
    if ([driver, merchant].some(v => !Number.isFinite(v) || v < 0 || v > 100)) return;
    setSaving(true);
    try {
      await apiService.put('/marketplace/admin/commission-rules/driver', {party:'driver',mode:'percentage',rate_percent:driver,fixed_cents:0,min_cents:Math.round(Number(driverMinimum || 0) * 100),active:true});
      await apiService.put('/marketplace/admin/commission-rules/merchant', {party:'merchant',mode:'percentage',rate_percent:merchant,fixed_cents:0,min_cents:Math.round(Number(merchantMinimum || 0) * 100),active:marketPolicy==='driver_and_merchant'});
      await fetchConfig();
    } finally { setSaving(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: any = {
        mercadopago_enabled: mpEnabled,
        astropay_enabled: apEnabled,
      };
      if (mpPublicKey) body.mercadopago_public_key = mpPublicKey;
      if (mpAccessToken) body.mercadopago_access_token = mpAccessToken;
      if (apApiKey) body.astropay_api_key = apApiKey;
      if (apSecret) body.astropay_secret = apSecret;
      await apiService.put('/admin/payment-config', body);
      setMpAccessToken('');
      setApApiKey('');
      setApSecret('');
      fetchConfig();
    } catch (e:any) { operatorAlert('No se pudo completar', e.message || 'Revisá la conexión e intentá nuevamente.'); } finally { setSaving(false); }
  };

  if (loading) return <SafeAreaView style={s.container}><ActivityIndicator size="large" color="#E85E1A" style={{marginTop:40}} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Pasarelas de Pago</Text>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.infoCard}>
          <Ionicons name="information-circle" size={20} color="#3B82F6" />
          <Text style={s.infoText}>Configurá las API keys de MercadoPago y AstroPay. Si no están configuradas, las pasarelas estarán desactivadas.</Text>
        </View>

        {/* MercadoPago */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <View style={[s.providerIcon, {backgroundColor:'#009EE3'}]}>
              <Text style={s.providerInitial}>MP</Text>
            </View>
            <View style={{flex:1}}>
              <Text style={s.cardTitle}>MercadoPago</Text>
              <Text style={s.cardSubtitle}>Pasajeros y conductores</Text>
            </View>
            <Switch value={mpEnabled} onValueChange={setMpEnabled} trackColor={{true:'#009EE3'}} />
          </View>

          {mpEnabled && (
            <View style={s.cardBody}>
              <View style={s.statusRow}>
                <View style={[s.statusIndicator, config?.mercadopago_configured?s.statusGreen:s.statusRed]} />
                <Text style={s.statusText}>{config?.mercadopago_configured?'Configurado':'Sin configurar'}</Text>
              </View>
              <Text style={s.inputLabel}>Public Key</Text>
              <TextInput style={s.input} value={mpPublicKey} onChangeText={setMpPublicKey} placeholder="APP_USR-xxxxxxxx" />
              <Text style={s.inputLabel}>Access Token</Text>
              <TextInput style={s.input} value={mpAccessToken} onChangeText={setMpAccessToken} placeholder="Dejar vacío para no cambiar" secureTextEntry />
              {config?.mercadopago_configured && <Text style={s.configuredHint}>Token actual: {config.mercadopago_access_token}</Text>}
            </View>
          )}
        </View>

        <View style={s.card}>
          <View style={s.cardHeader}>
            <View style={[s.providerIcon,{backgroundColor:'#FF5A2A'}]}><Ionicons name="storefront" size={22} color="#fff" /></View>
            <View style={{flex:1}}><Text style={s.cardTitle}>Comisiones Marketplace</Text><Text style={s.cardSubtitle}>Versionadas; los cambios aplican solo a pedidos nuevos</Text></View>
          </View>
          <View style={s.cardBody}>
            <Text style={s.inputLabel}>Política</Text>
            <View style={s.policyRow}>
              {([['driver_only','Solo conductor'],['driver_and_merchant','Conductor y comercio']] as const).map(([value,label]) => <TouchableOpacity key={value} style={[s.policyChip,marketPolicy===value&&s.policyChipOn]} onPress={()=>setMarketPolicy(value)}><Text style={[s.policyText,marketPolicy===value&&s.policyTextOn]}>{label}</Text></TouchableOpacity>)}
            </View>
            <View style={s.ruleGrid}>
              <View style={s.ruleCard}><Text style={s.cardTitle}>Repartidor</Text><Text style={s.cardSubtitle}>Sobre el costo de entrega</Text><Text style={s.inputLabel}>Porcentaje</Text><TextInput style={s.input} value={driverRate} onChangeText={setDriverRate} keyboardType="decimal-pad" /><Text style={s.inputLabel}>Mínimo en pesos</Text><TextInput style={s.input} value={driverMinimum} onChangeText={setDriverMinimum} keyboardType="numeric" /></View>
              <View style={[s.ruleCard,marketPolicy==='driver_only'&&{opacity:.5}]}><Text style={s.cardTitle}>Comercio</Text><Text style={s.cardSubtitle}>Sobre el subtotal de productos</Text><Text style={s.inputLabel}>Porcentaje</Text><TextInput style={s.input} value={merchantRate} onChangeText={setMerchantRate} keyboardType="decimal-pad" editable={marketPolicy==='driver_and_merchant'} /><Text style={s.inputLabel}>Mínimo en pesos</Text><TextInput style={s.input} value={merchantMinimum} onChangeText={setMerchantMinimum} keyboardType="numeric" editable={marketPolicy==='driver_and_merchant'} /></View>
            </View>
            <Text style={s.commissionNote}>Efectivo o transferencia directa generan una deuda/liquidación; nunca se descuenta comisión del conductor sobre la mercadería.</Text>
            <TouchableOpacity style={s.saveBtn} onPress={saveMarketplaceCommissions} disabled={saving}><Text style={s.saveBtnText}>Guardar reglas versionadas</Text></TouchableOpacity>
          </View>
        </View>

        {/* AstroPay */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <View style={[s.providerIcon, {backgroundColor:'#FF6B00'}]}>
              <Text style={s.providerInitial}>AP</Text>
            </View>
            <View style={{flex:1}}>
              <Text style={s.cardTitle}>AstroPay</Text>
              <Text style={s.cardSubtitle}>Pasajeros y conductores</Text>
            </View>
            <Switch value={apEnabled} onValueChange={setApEnabled} trackColor={{true:'#FF6B00'}} />
          </View>

          {apEnabled && (
            <View style={s.cardBody}>
              <View style={s.statusRow}>
                <View style={[s.statusIndicator, config?.astropay_configured?s.statusGreen:s.statusRed]} />
                <Text style={s.statusText}>{config?.astropay_configured?'Configurado':'Sin configurar'}</Text>
              </View>
              <Text style={s.inputLabel}>API Key</Text>
              <TextInput style={s.input} value={apApiKey} onChangeText={setApApiKey} placeholder="Dejar vacío para no cambiar" secureTextEntry />
              <Text style={s.inputLabel}>Secret</Text>
              <TextInput style={s.input} value={apSecret} onChangeText={setApSecret} placeholder="Dejar vacío para no cambiar" secureTextEntry />
            </View>
          )}
        </View>

        <TouchableOpacity style={s.saveBtn} onPress={handleSave} disabled={saving}>
          <Text style={s.saveBtnText}>{saving?'Guardando...':'Guardar configuración'}</Text>
        </TouchableOpacity>

        <View style={{height:40}} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:'#F2F2F7'},
  header:{padding:16,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#E5E5EA'},
  title:{fontSize:24,fontWeight:'bold',color:'#1C1C1E'},
  content:{padding:16,gap:14},
  infoCard:{flexDirection:'row',backgroundColor:'#EFF6FF',borderRadius:12,padding:14,gap:10},
  infoText:{flex:1,fontSize:13,color:'#1E40AF',lineHeight:18},
  card:{backgroundColor:'#fff',borderRadius:14,overflow:'hidden'},
  cardHeader:{flexDirection:'row',alignItems:'center',padding:16,gap:12},
  providerIcon:{width:44,height:44,borderRadius:12,justifyContent:'center',alignItems:'center'},
  providerInitial:{fontSize:16,fontWeight:'800',color:'#fff'},
  cardTitle:{fontSize:16,fontWeight:'700',color:'#1C1C1E'},
  cardSubtitle:{fontSize:12,color:'#8E8E93'},
  cardBody:{padding:16,paddingTop:0},
  statusRow:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:12},
  statusIndicator:{width:10,height:10,borderRadius:5},
  statusGreen:{backgroundColor:'#10B981'},statusRed:{backgroundColor:'#EF4444'},
  statusText:{fontSize:13,color:'#666',fontWeight:'600'},
  inputLabel:{fontSize:12,fontWeight:'600',color:'#666',marginBottom:4,marginTop:8},
  input:{backgroundColor:'#F9FAFB',borderWidth:1,borderColor:'#E5E5EA',borderRadius:8,paddingHorizontal:12,paddingVertical:10,fontSize:14},
  configuredHint:{fontSize:11,color:'#8E8E93',marginTop:4},
  policyRow:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:12},policyChip:{borderWidth:1,borderColor:'#E5E5EA',borderRadius:999,paddingHorizontal:12,paddingVertical:9},policyChipOn:{backgroundColor:'#FFF0EA',borderColor:'#FF5A2A'},policyText:{fontWeight:'700',color:'#555'},policyTextOn:{color:'#E94D20'},
  ruleGrid:{flexDirection:'row',flexWrap:'wrap',gap:12},ruleCard:{flex:1,minWidth:230,backgroundColor:'#F9F8F6',borderRadius:14,padding:14},commissionNote:{fontSize:12,lineHeight:17,color:'#666',marginVertical:12},
  saveBtn:{backgroundColor:'#E85E1A',borderRadius:10,paddingVertical:14,alignItems:'center'},
  saveBtnText:{color:'#fff',fontWeight:'700',fontSize:16},
});
