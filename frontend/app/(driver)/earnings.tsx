import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiService } from '@/src/services/api';

interface EarningsData {
  period: string;
  total_earnings: number;
  total_rides: number;
  average_per_ride: number;
}

interface WalletStatus {
  balance: number;
  driver_block: any;
  cancel_count_30d: number;
  max_cancels_before_block: number;
  max_negative_balance: number;
  cancel_penalty: number;
}

interface WalletTxn {
  transaction_id: string;
  amount: number;
  transaction_type: string;
  description: string;
  created_at: string;
}

export default function DriverEarningsScreen() {
  const router = useRouter();
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [walletStatus, setWalletStatus] = useState<WalletStatus | null>(null);
  const [transactions, setTransactions] = useState<WalletTxn[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAlias, setWithdrawAlias] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawMessage, setWithdrawMessage] = useState('');

  const submitWithdrawal = async () => {
    const amount = Number(withdrawAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0 || !withdrawAlias.trim()) {
      setWithdrawMessage('Ingresá un monto válido y el alias de transferencia.');
      return;
    }
    setWithdrawing(true); setWithdrawMessage('');
    try {
      await apiService.post('/wallet/withdrawals', { amount, transfer_alias: withdrawAlias.trim() }, {
        headers: { 'Idempotency-Key': `withdraw-${Date.now()}-${amount}` },
      });
      setWithdrawMessage('Solicitud enviada. La verás acreditada cuando administración la apruebe.');
      setWithdrawAmount('');
      await fetchAll();
    } catch (e: any) {
      setWithdrawMessage(e.message || 'No pudimos enviar la solicitud.');
    } finally { setWithdrawing(false); }
  };

  const fetchAll = useCallback(async () => {
    try {
      const [earningsRes, walletRes, txnsRes] = await Promise.all([
        apiService.get(`/drivers/earnings?period=${selectedPeriod}`),
        apiService.get('/wallet/status'),
        apiService.get('/wallet/transactions'),
      ]);
      setEarnings(earningsRes);
      setWalletStatus(walletRes);
      setTransactions(txnsRes?.transactions || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAll();
  };

  const balance = walletStatus?.balance ?? 0;
  const isNegative = balance < 0;

  const periods = [
    { id: 'today', label: 'Hoy' },
    { id: 'week', label: 'Semana' },
    { id: 'month', label: 'Mes' },
    { id: 'all', label: 'Total' },
  ];

  const getTxnIcon = (type: string) => {
    switch (type) {
      case 'commission_debit': return { name: 'remove-circle', color: '#FF3B30' };
      case 'ride_earnings': return { name: 'add-circle', color: '#00C853' };
      case 'cancel_penalty': return { name: 'warning', color: '#FF9500' };
      case 'cancel_compensation': return { name: 'gift', color: '#007AFF' };
      case 'recharge': return { name: 'wallet', color: '#00C853' };
      default: return { name: 'swap-horizontal', color: '#8E8E93' };
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={st.container}>
        <ActivityIndicator size="large" color="#00C853" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.container}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}><Ionicons name="arrow-back" size={22} color="#1C1C1E" /></TouchableOpacity><Text style={st.title}>Billetera</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Wallet Balance Card */}
        <View style={[st.balanceCard, isNegative ? st.balanceCardNeg : st.balanceCardPos]}>
          <Text style={st.balanceLabel}>
            {isNegative ? 'Debes al sistema' : 'Saldo a favor'}
          </Text>
          <Text style={st.balanceAmount}>
            ${Math.abs(balance).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </Text>
          {isNegative && (
            <Text style={st.balanceHint}>
              Comisiones pendientes por viajes en efectivo
            </Text>
          )}
          
          <View style={st.balanceActions}>
            {isNegative && (
              <TouchableOpacity style={st.rechargeBtn} onPress={() => {
                Alert.alert('Pagar deuda', 'Por el momento podés regularizar tu deuda realizando viajes con tarjeta. Próximamente más opciones de pago.');
              }}>
                <Ionicons name="card-outline" size={18} color="#fff" />
                <Text style={st.rechargeBtnText}>Pagar deuda</Text>
              </TouchableOpacity>
            )}
            {!isNegative && balance > 0 && (
              <TouchableOpacity accessibilityRole="button" style={st.withdrawBtn} onPress={() => { setWithdrawMessage(''); setWithdrawOpen(true); }}>
                <Ionicons name="arrow-up-circle-outline" size={18} color="#00C853" />
                <Text style={st.withdrawBtnText}>Retirar</Text>
              </TouchableOpacity>
            )}
          </View>
          
          {/* Limit indicator */}
          {isNegative && walletStatus?.max_negative_balance && (
            <View style={st.limitBar}>
              <View style={st.limitBarBg}>
                <View 
                  style={[
                    st.limitBarFill,
                    { width: `${Math.min(100, (Math.abs(balance) / Math.abs(walletStatus.max_negative_balance)) * 100)}%` }
                  ]} 
                />
              </View>
              <Text style={st.limitText}>
                Límite: ${Math.abs(walletStatus.max_negative_balance).toLocaleString('es-AR')}
              </Text>
            </View>
          )}
        </View>

        {/* Cancellation info */}
        {walletStatus && (
          <View style={st.cancelInfo}>
            <View style={st.cancelInfoRow}>
              <Ionicons name="alert-circle-outline" size={16} color="#FF9500" />
              <Text style={st.cancelInfoText}>
                Cancelaciones (30 días): {walletStatus.cancel_count_30d}/{walletStatus.max_cancels_before_block}
              </Text>
            </View>
          </View>
        )}

        {/* Period selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.periodSelector}
        >
          {periods.map((period) => (
            <TouchableOpacity
              key={period.id}
              style={[st.periodButton, selectedPeriod === period.id && st.periodButtonActive]}
              onPress={() => setSelectedPeriod(period.id as any)}
            >
              <Text style={[st.periodButtonText, selectedPeriod === period.id && st.periodButtonTextActive]}>
                {period.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Earnings summary */}
        <View style={st.earningsCard}>
          <Text style={st.earningsLabel}>Viajes completados</Text>
          <View style={st.earningsRow}>
            <View style={st.earningsItem}>
              <Text style={st.earningsValue}>{earnings?.total_rides || 0}</Text>
              <Text style={st.earningsSubLabel}>Viajes</Text>
            </View>
            <View style={st.earningsDivider} />
            <View style={st.earningsItem}>
              <Text style={st.earningsValue}>
                ${earnings?.total_earnings?.toFixed(0) || '0'}
              </Text>
              <Text style={st.earningsSubLabel}>Total cobrado</Text>
            </View>
            <View style={st.earningsDivider} />
            <View style={st.earningsItem}>
              <Text style={st.earningsValue}>
                ${earnings?.average_per_ride?.toFixed(0) || '0'}
              </Text>
              <Text style={st.earningsSubLabel}>Promedio</Text>
            </View>
          </View>
        </View>

        {/* Recent Transactions */}
        <View style={st.txnSection}>
          <Text style={st.sectionTitle}>Movimientos recientes</Text>
          {transactions.length === 0 ? (
            <View style={st.emptyTxn}>
              <Ionicons name="receipt-outline" size={40} color="#C7C7CC" />
              <Text style={st.emptyTxnText}>Sin movimientos aún</Text>
            </View>
          ) : (
            transactions.slice(0, 15).map((txn) => {
              const icon = getTxnIcon(txn.transaction_type);
              const isPositive = txn.amount > 0;
              return (
                <View key={txn.transaction_id} style={st.txnCard}>
                  <Ionicons name={icon.name as any} size={24} color={icon.color} />
                  <View style={st.txnInfo}>
                    <Text style={st.txnDesc} numberOfLines={1}>{txn.description}</Text>
                    <Text style={st.txnDate}>
                      {txn.created_at ? new Date(txn.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                    </Text>
                  </View>
                  <Text style={[st.txnAmount, isPositive ? st.txnPos : st.txnNeg]}>
                    {isPositive ? '+' : ''}${txn.amount?.toFixed(0)}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        {/* Explanation */}
        <View style={st.explainCard}>
          <Ionicons name="information-circle" size={20} color="#007AFF" />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={st.explainTitle}>¿Cómo funciona tu billetera?</Text>
            <Text style={st.explainText}>
              • Viaje en <Text style={{ fontWeight: '700' }}>efectivo</Text>: Cobras directamente al pasajero. La comisión del sistema se descuenta de tu billetera (saldo negativo).{'\n'}
              • Viaje con <Text style={{ fontWeight: '700' }}>tarjeta</Text>: El sistema cobra al pasajero. Tu ganancia (tarifa - comisión) se acredita a tu billetera.{'\n'}
              • Puedes pagar tu deuda en cualquier momento con «Pagar deuda».
            </Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
      <Modal visible={withdrawOpen} transparent animationType="fade" onRequestClose={()=>setWithdrawOpen(false)}>
        <View style={st.modalBackdrop}><View style={st.modalCard}>
          <View style={st.modalIcon}><Ionicons name="arrow-up-circle-outline" size={30} color="#FF7733"/></View>
          <Text style={st.modalTitle}>Solicitar retiro</Text>
          <Text style={st.modalCopy}>El saldo quedará reservado cuando administración apruebe la transferencia.</Text>
          <Text style={st.inputLabel}>Monto</Text><TextInput accessibilityLabel="Monto a retirar" style={st.input} value={withdrawAmount} onChangeText={setWithdrawAmount} keyboardType="decimal-pad" placeholder="0,00"/>
          <Text style={st.inputLabel}>Alias de transferencia</Text><TextInput accessibilityLabel="Alias de transferencia" autoCapitalize="none" style={st.input} value={withdrawAlias} onChangeText={setWithdrawAlias} placeholder="tu.alias"/>
          {withdrawMessage?<Text style={st.modalMessage}>{withdrawMessage}</Text>:null}
          <TouchableOpacity accessibilityRole="button" disabled={withdrawing} style={st.modalPrimary} onPress={submitWithdrawal}>{withdrawing?<ActivityIndicator color="#FFF"/>:<Text style={st.modalPrimaryText}>Enviar solicitud</Text>}</TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" style={st.modalSecondary} onPress={()=>setWithdrawOpen(false)}><Text style={st.modalSecondaryText}>Cerrar</Text></TouchableOpacity>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: { backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E5E5EA', flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: '#1C1C1E' },
  
  // Balance card
  balanceCard: { margin: 16, borderRadius: 20, padding: 24 },
  balanceCardNeg: { backgroundColor: '#FF3B30' },
  balanceCardPos: { backgroundColor: '#00C853' },
  balanceLabel: { fontSize: 14, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  balanceAmount: { fontSize: 44, fontWeight: '800', color: '#fff', marginTop: 4 },
  balanceHint: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  balanceActions: { marginTop: 16 },
  rechargeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 14, paddingVertical: 14 },
  rechargeBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  withdrawBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 14, paddingVertical: 14 },
  withdrawBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  limitBar: { marginTop: 16 },
  limitBarBg: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  limitBarFill: { height: 6, borderRadius: 3, backgroundColor: '#fff' },
  limitText: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 4, textAlign: 'right' },
  
  // Cancel info
  cancelInfo: { marginHorizontal: 16, backgroundColor: '#FFF8E6', borderRadius: 12, padding: 12, marginBottom: 4 },
  cancelInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cancelInfoText: { fontSize: 13, color: '#8B6914', fontWeight: '600' },
  
  // Period selector
  periodSelector: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  periodButton: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: '#fff', marginRight: 8 },
  periodButtonActive: { backgroundColor: '#1C1C1E' },
  periodButtonText: { fontSize: 14, fontWeight: '600', color: '#8E8E93' },
  periodButtonTextActive: { color: '#fff' },
  
  // Earnings card
  earningsCard: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16, padding: 20, marginBottom: 16 },
  earningsLabel: { fontSize: 16, fontWeight: '700', color: '#1C1C1E', marginBottom: 16 },
  earningsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  earningsItem: { flex: 1, alignItems: 'center' },
  earningsValue: { fontSize: 22, fontWeight: '800', color: '#1C1C1E' },
  earningsSubLabel: { fontSize: 11, color: '#8E8E93', marginTop: 4, fontWeight: '600' },
  earningsDivider: { width: 1, backgroundColor: '#E5E5EA' },
  
  // Transactions
  txnSection: { paddingHorizontal: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginBottom: 12 },
  emptyTxn: { alignItems: 'center', paddingVertical: 32, backgroundColor: '#fff', borderRadius: 16 },
  emptyTxnText: { fontSize: 14, color: '#8E8E93', marginTop: 8 },
  txnCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, gap: 12 },
  txnInfo: { flex: 1 },
  txnDesc: { fontSize: 14, fontWeight: '600', color: '#1C1C1E' },
  txnDate: { fontSize: 11, color: '#8E8E93', marginTop: 2 },
  txnAmount: { fontSize: 16, fontWeight: '800' },
  txnPos: { color: '#00C853' },
  txnNeg: { color: '#FF3B30' },
  
  // Explain
  explainCard: { flexDirection: 'row', marginHorizontal: 16, marginTop: 16, backgroundColor: '#EFF6FF', borderRadius: 14, padding: 16 },
  explainTitle: { fontSize: 14, fontWeight: '700', color: '#1C1C1E', marginBottom: 6 },
  explainText: { fontSize: 12, color: '#636366', lineHeight: 18 },
  modalBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.45)',alignItems:'center',justifyContent:'center',padding:20},
  modalCard:{width:'100%',maxWidth:430,backgroundColor:'#FFF',borderRadius:24,padding:22},
  modalIcon:{width:56,height:56,borderRadius:18,backgroundColor:'#FFF0EC',alignItems:'center',justifyContent:'center'},
  modalTitle:{fontSize:23,fontWeight:'900',color:'#202124',marginTop:14},
  modalCopy:{fontSize:13,lineHeight:19,color:'#70757A',marginTop:5,marginBottom:16},
  inputLabel:{fontSize:11,fontWeight:'800',color:'#555',marginTop:10,marginBottom:6},
  input:{height:48,borderWidth:1,borderColor:'#E4E0DC',borderRadius:14,paddingHorizontal:14,fontSize:16,color:'#202124'},
  modalMessage:{fontSize:12,lineHeight:18,color:'#B54708',backgroundColor:'#FFF3E8',padding:10,borderRadius:10,marginTop:12},
  modalPrimary:{height:48,borderRadius:14,backgroundColor:'#FF7733',alignItems:'center',justifyContent:'center',marginTop:16},
  modalPrimaryText:{color:'#FFF',fontSize:15,fontWeight:'900'},
  modalSecondary:{height:44,alignItems:'center',justifyContent:'center'},
  modalSecondaryText:{fontSize:14,fontWeight:'800',color:'#62666B'},
});
