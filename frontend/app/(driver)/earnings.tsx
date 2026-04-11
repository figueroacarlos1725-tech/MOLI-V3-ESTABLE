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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [walletStatus, setWalletStatus] = useState<WalletStatus | null>(null);
  const [transactions, setTransactions] = useState<WalletTxn[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
      case 'ride_earnings': return { name: 'add-circle', color: '#6BBF00' };
      case 'cancel_penalty': return { name: 'warning', color: '#FF9500' };
      case 'cancel_compensation': return { name: 'gift', color: '#007AFF' };
      case 'recharge': return { name: 'wallet', color: '#6BBF00' };
      default: return { name: 'swap-horizontal', color: '#8E8E93' };
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={st.container}>
        <ActivityIndicator size="large" color="#6BBF00" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.container}>
      <View style={st.header}>
        <Text style={st.title}>Billetera</Text>
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
              <TouchableOpacity style={st.rechargeBtn}>
                <Ionicons name="card-outline" size={18} color="#fff" />
                <Text style={st.rechargeBtnText}>Pagar deuda</Text>
              </TouchableOpacity>
            )}
            {!isNegative && balance > 0 && (
              <TouchableOpacity style={st.withdrawBtn}>
                <Ionicons name="arrow-up-circle-outline" size={18} color="#6BBF00" />
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
              • Puedes pagar tu deuda en cualquier momento con "Pagar deuda".
            </Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: { backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  title: { fontSize: 28, fontWeight: '800', color: '#1C1C1E' },
  
  // Balance card
  balanceCard: { margin: 16, borderRadius: 20, padding: 24 },
  balanceCardNeg: { backgroundColor: '#FF3B30' },
  balanceCardPos: { backgroundColor: '#6BBF00' },
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
  txnPos: { color: '#6BBF00' },
  txnNeg: { color: '#FF3B30' },
  
  // Explain
  explainCard: { flexDirection: 'row', marginHorizontal: 16, marginTop: 16, backgroundColor: '#EFF6FF', borderRadius: 14, padding: 16 },
  explainTitle: { fontSize: 14, fontWeight: '700', color: '#1C1C1E', marginBottom: 6 },
  explainText: { fontSize: 12, color: '#636366', lineHeight: 18 },
});
