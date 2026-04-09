import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import { apiService } from '@/src/services/api';
import { Button } from '@/src/components/Button';
import { format } from 'date-fns';

interface Transaction {
  transaction_id: string;
  amount: number;
  transaction_type: string;
  payment_method: string;
  status: string;
  created_at: string;
}

export default function RiderWalletScreen() {
  const { user, updateUser } = useAuthStore();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showAddFundsModal, setShowAddFundsModal] = useState(false);
  const [addAmount, setAddAmount] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'mercadopago' | 'astropay'>('mercadopago');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      const response = await apiService.get('/wallet/transactions');
      setTransactions(response.transactions || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  const handleAddFunds = async () => {
    const amount = parseFloat(addAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiService.post(`/wallet/add-funds?amount=${amount}&payment_method=${selectedPaymentMethod}`);
      
      if (response.status === 'pending_config') {
        Alert.alert(
          'Payment Gateway Not Configured',
          'The payment gateway is not yet configured. Please contact admin to set up payment methods.',
          [{ text: 'OK' }]
        );
      } else if (response.checkout_url) {
        // In a real app, open the checkout URL in a browser
        Alert.alert(
          'Redirect to Payment',
          'You will be redirected to complete the payment.',
          [{ text: 'OK' }]
        );
      }
      
      setShowAddFundsModal(false);
      setAddAmount('');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to initiate payment');
    } finally {
      setIsLoading(false);
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'deposit':
        return 'arrow-down-circle';
      case 'withdrawal':
        return 'arrow-up-circle';
      case 'payment':
        return 'car';
      case 'refund':
        return 'refresh-circle';
      default:
        return 'cash';
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'deposit':
      case 'refund':
        return '#34C759';
      case 'withdrawal':
      case 'payment':
        return '#FF3B30';
      default:
        return '#8E8E93';
    }
  };

  const renderTransaction = ({ item }: { item: Transaction }) => (
    <View style={styles.transactionCard}>
      <View style={[styles.transactionIcon, { backgroundColor: `${getTransactionColor(item.transaction_type)}20` }]}>
        <Ionicons
          name={getTransactionIcon(item.transaction_type) as any}
          size={24}
          color={getTransactionColor(item.transaction_type)}
        />
      </View>
      <View style={styles.transactionDetails}>
        <Text style={styles.transactionType}>
          {item.transaction_type.charAt(0).toUpperCase() + item.transaction_type.slice(1)}
        </Text>
        <Text style={styles.transactionDate}>
          {format(new Date(item.created_at), 'MMM d, yyyy • h:mm a')}
        </Text>
      </View>
      <Text style={[
        styles.transactionAmount,
        { color: getTransactionColor(item.transaction_type) }
      ]}>
        {item.transaction_type === 'deposit' || item.transaction_type === 'refund' ? '+' : '-'}
        ${item.amount.toFixed(2)}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Wallet</Text>
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Available Balance</Text>
        <Text style={styles.balanceAmount}>${user?.wallet_balance?.toFixed(2) || '0.00'}</Text>
        <View style={styles.balanceActions}>
          <TouchableOpacity
            style={styles.balanceButton}
            onPress={() => setShowAddFundsModal(true)}
          >
            <Ionicons name="add-circle" size={20} color="#fff" />
            <Text style={styles.balanceButtonText}>Add Funds</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.transactionsSection}>
        <Text style={styles.sectionTitle}>Transaction History</Text>
        <FlatList
          data={transactions}
          renderItem={renderTransaction}
          keyExtractor={(item) => item.transaction_id}
          contentContainerStyle={styles.transactionsList}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={64} color="#E5E5EA" />
              <Text style={styles.emptyText}>No transactions yet</Text>
            </View>
          }
        />
      </View>

      {/* Add Funds Modal */}
      <Modal
        visible={showAddFundsModal}
        animationType="slide"
        transparent={true}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Funds</Text>
              <TouchableOpacity onPress={() => setShowAddFundsModal(false)}>
                <Ionicons name="close" size={24} color="#1C1C1E" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Amount</Text>
            <View style={styles.amountInput}>
              <Text style={styles.currencySymbol}>$</Text>
              <TextInput
                style={styles.amountTextInput}
                value={addAmount}
                onChangeText={setAddAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor="#8E8E93"
              />
            </View>

            <Text style={styles.inputLabel}>Payment Method</Text>
            <View style={styles.paymentMethods}>
              <TouchableOpacity
                style={[
                  styles.paymentMethodCard,
                  selectedPaymentMethod === 'mercadopago' && styles.paymentMethodSelected
                ]}
                onPress={() => setSelectedPaymentMethod('mercadopago')}
              >
                <Ionicons name="card" size={24} color={selectedPaymentMethod === 'mercadopago' ? '#007AFF' : '#8E8E93'} />
                <Text style={[
                  styles.paymentMethodText,
                  selectedPaymentMethod === 'mercadopago' && styles.paymentMethodTextSelected
                ]}>
                  MercadoPago
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.paymentMethodCard,
                  selectedPaymentMethod === 'astropay' && styles.paymentMethodSelected
                ]}
                onPress={() => setSelectedPaymentMethod('astropay')}
              >
                <Ionicons name="wallet" size={24} color={selectedPaymentMethod === 'astropay' ? '#007AFF' : '#8E8E93'} />
                <Text style={[
                  styles.paymentMethodText,
                  selectedPaymentMethod === 'astropay' && styles.paymentMethodTextSelected
                ]}>
                  AstroPay
                </Text>
              </TouchableOpacity>
            </View>

            <Button
              title="Add Funds"
              onPress={handleAddFunds}
              loading={isLoading}
              disabled={!addAmount}
              style={styles.addFundsButton}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  balanceCard: {
    backgroundColor: '#007AFF',
    margin: 16,
    borderRadius: 20,
    padding: 24,
  },
  balanceLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  balanceAmount: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  balanceActions: {
    flexDirection: 'row',
    marginTop: 24,
  },
  balanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
  },
  balanceButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  transactionsSection: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  transactionsList: {
    paddingHorizontal: 20,
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  transactionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transactionDetails: {
    flex: 1,
    marginLeft: 12,
  },
  transactionType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  transactionDate: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 4,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 16,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  amountInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  amountTextInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '600',
    color: '#1C1C1E',
    paddingVertical: 16,
    marginLeft: 8,
  },
  paymentMethods: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  paymentMethodCard: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paymentMethodSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#E3F2FD',
  },
  paymentMethodText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    marginTop: 8,
  },
  paymentMethodTextSelected: {
    color: '#007AFF',
  },
  addFundsButton: {
    marginBottom: 20,
  },
});
