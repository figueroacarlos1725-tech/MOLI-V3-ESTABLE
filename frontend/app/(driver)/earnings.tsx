import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/src/services/api';

interface EarningsData {
  period: string;
  total_earnings: number;
  total_rides: number;
  average_per_ride: number;
}

export default function DriverEarningsScreen() {
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchEarnings();
  }, [selectedPeriod]);

  const fetchEarnings = async () => {
    setIsLoading(true);
    try {
      const response = await apiService.get(`/drivers/earnings?period=${selectedPeriod}`);
      setEarnings(response);
    } catch (error) {
      console.error('Error fetching earnings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const periods = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'all', label: 'All Time' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Earnings</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Period Selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.periodSelector}
        >
          {periods.map((period) => (
            <TouchableOpacity
              key={period.id}
              style={[
                styles.periodButton,
                selectedPeriod === period.id && styles.periodButtonActive,
              ]}
              onPress={() => setSelectedPeriod(period.id as any)}
            >
              <Text style={[
                styles.periodButtonText,
                selectedPeriod === period.id && styles.periodButtonTextActive,
              ]}>
                {period.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Main Earnings Card */}
        <View style={styles.earningsCard}>
          <Text style={styles.earningsLabel}>Total Earnings</Text>
          <Text style={styles.earningsAmount}>
            ${earnings?.total_earnings.toFixed(2) || '0.00'}
          </Text>
          <View style={styles.earningsStats}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{earnings?.total_rides || 0}</Text>
              <Text style={styles.statLabel}>Rides</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                ${earnings?.average_per_ride.toFixed(2) || '0.00'}
              </Text>
              <Text style={styles.statLabel}>Avg/Ride</Text>
            </View>
          </View>
        </View>

        {/* Quick Stats */}
        <View style={styles.quickStats}>
          <View style={styles.quickStatCard}>
            <View style={[styles.quickStatIcon, { backgroundColor: '#E3F2FD' }]}>
              <Ionicons name="car" size={24} color="#007AFF" />
            </View>
            <Text style={styles.quickStatValue}>{earnings?.total_rides || 0}</Text>
            <Text style={styles.quickStatLabel}>Completed Rides</Text>
          </View>

          <View style={styles.quickStatCard}>
            <View style={[styles.quickStatIcon, { backgroundColor: '#E8F5E9' }]}>
              <Ionicons name="trending-up" size={24} color="#34C759" />
            </View>
            <Text style={styles.quickStatValue}>
              ${earnings?.average_per_ride.toFixed(2) || '0.00'}
            </Text>
            <Text style={styles.quickStatLabel}>Average Earning</Text>
          </View>
        </View>

        {/* Withdraw Section */}
        <View style={styles.withdrawSection}>
          <Text style={styles.sectionTitle}>Withdraw Earnings</Text>
          <View style={styles.withdrawCard}>
            <View style={styles.withdrawInfo}>
              <Text style={styles.withdrawLabel}>Available Balance</Text>
              <Text style={styles.withdrawAmount}>
                ${earnings?.total_earnings.toFixed(2) || '0.00'}
              </Text>
            </View>
            <TouchableOpacity style={styles.withdrawButton}>
              <Text style={styles.withdrawButtonText}>Withdraw</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.withdrawNote}>
            Withdrawals are processed within 1-3 business days
          </Text>
        </View>

        {/* Payment Methods */}
        <View style={styles.paymentSection}>
          <Text style={styles.sectionTitle}>Payment Methods</Text>
          <TouchableOpacity style={styles.paymentCard}>
            <View style={styles.paymentIcon}>
              <Ionicons name="card" size={24} color="#007AFF" />
            </View>
            <View style={styles.paymentInfo}>
              <Text style={styles.paymentTitle}>Bank Account</Text>
              <Text style={styles.paymentSubtitle}>Add a bank account for withdrawals</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  periodSelector: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },
  periodButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#fff',
    marginRight: 8,
  },
  periodButtonActive: {
    backgroundColor: '#34C759',
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
  },
  periodButtonTextActive: {
    color: '#fff',
  },
  earningsCard: {
    backgroundColor: '#34C759',
    margin: 16,
    borderRadius: 20,
    padding: 24,
  },
  earningsLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  earningsAmount: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  earningsStats: {
    flexDirection: 'row',
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  statLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  quickStats: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
  },
  quickStatCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  quickStatIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  quickStatValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  quickStatLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
  },
  withdrawSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  withdrawCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  withdrawInfo: {},
  withdrawLabel: {
    fontSize: 13,
    color: '#8E8E93',
  },
  withdrawAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginTop: 4,
  },
  withdrawButton: {
    backgroundColor: '#34C759',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  withdrawButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  withdrawNote: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 12,
    textAlign: 'center',
  },
  paymentSection: {
    padding: 16,
  },
  paymentCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentInfo: {
    flex: 1,
    marginLeft: 12,
  },
  paymentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  paymentSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 4,
  },
});
