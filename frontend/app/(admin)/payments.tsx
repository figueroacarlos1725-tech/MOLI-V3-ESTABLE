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

  useEffect(() => { fetchConfig(); }, []);

  const fetchConfig = async () => {
    try {
      const r = await apiService.get('/admin/payment-config');
      setConfig(r);
      setMpEnabled(r.mercadopago_enabled || false);
      setMpPublicKey(r.mercadopago_public_key || '');
      setApEnabled(r.astropay_enabled || false);
    } catch (e) {} finally { setLoading(false); }
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
    } catch (e) {} finally { setSaving(false); }
  };

  if (loading) return <SafeAreaView style={s.container}><ActivityIndicator size="large" color="#E8492E" style={{marginTop:40}} /></SafeAreaView>;

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
  saveBtn:{backgroundColor:'#E8492E',borderRadius:10,paddingVertical:14,alignItems:'center'},
  saveBtnText:{color:'#fff',fontWeight:'700',fontSize:16},
});
