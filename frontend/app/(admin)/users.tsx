import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/src/services/api';
import { Button } from '@/src/components/Button';

interface User {
  user_id: string;
  name: string;
  email: string;
  phone?: string;
  user_type: string;
  rating: number;
  wallet_balance: number;
  is_verified: boolean;
  created_at: string;
}

export default function AdminUsersScreen() {
  const [users, setUsers] = useState<User[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, [filter]);

  const fetchUsers = async () => {
    try {
      let url = '/admin/users?limit=100';
      if (filter !== 'all') {
        url += `&user_type=${filter}`;
      }
      if (search) {
        url += `&search=${search}`;
      }
      const response = await apiService.get(url);
      setUsers(response.users || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchUsers();
    setRefreshing(false);
  };

  const handleSearch = () => {
    fetchUsers();
  };

  const handleViewUser = (user: User) => {
    setSelectedUser(user);
    setShowUserModal(true);
  };

  const handleVerifyDriver = async (driverId: string, verified: boolean) => {
    try {
      await apiService.put(`/admin/drivers/${driverId}/verify?verified=${verified}`);
      Alert.alert('Success', `Driver ${verified ? 'verified' : 'unverified'} successfully`);
      fetchUsers();
      setShowUserModal(false);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update driver status');
    }
  };

  const getUserTypeColor = (type: string) => {
    switch (type) {
      case 'rider':
        return '#007AFF';
      case 'driver':
        return '#34C759';
      case 'admin':
        return '#8E44AD';
      case 'dispatcher':
        return '#FF9500';
      default:
        return '#8E8E93';
    }
  };

  const renderUserItem = ({ item }: { item: User }) => (
    <TouchableOpacity
      style={styles.userCard}
      onPress={() => handleViewUser(item)}
    >
      <View style={styles.userAvatar}>
        <Ionicons
          name={item.user_type === 'driver' ? 'car' : 'person'}
          size={24}
          color={getUserTypeColor(item.user_type)}
        />
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.name}</Text>
        <Text style={styles.userEmail}>{item.email}</Text>
        <View style={styles.userMeta}>
          <View style={[styles.typeBadge, { backgroundColor: `${getUserTypeColor(item.user_type)}20` }]}>
            <Text style={[styles.typeBadgeText, { color: getUserTypeColor(item.user_type) }]}>
              {item.user_type.charAt(0).toUpperCase() + item.user_type.slice(1)}
            </Text>
          </View>
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={12} color="#FFD700" />
            <Text style={styles.ratingText}>{item.rating?.toFixed(1)}</Text>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
    </TouchableOpacity>
  );

  const filters = [
    { id: 'all', label: 'All' },
    { id: 'rider', label: 'Riders' },
    { id: 'driver', label: 'Drivers' },
    { id: 'admin', label: 'Admins' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Users</Text>
        <Text style={styles.subtitle}>{users.length} total</Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInput}>
          <Ionicons name="search" size={20} color="#8E8E93" />
          <TextInput
            style={styles.searchTextInput}
            placeholder="Search users..."
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={handleSearch}
          />
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filterContainer}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.id}
            style={[
              styles.filterButton,
              filter === f.id && styles.filterButtonActive,
            ]}
            onPress={() => setFilter(f.id)}
          >
            <Text style={[
              styles.filterText,
              filter === f.id && styles.filterTextActive,
            ]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={users}
        renderItem={renderUserItem}
        keyExtractor={(item) => item.user_id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color="#E5E5EA" />
            <Text style={styles.emptyText}>No users found</Text>
          </View>
        }
      />

      {/* User Detail Modal */}
      <Modal visible={showUserModal} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>User Details</Text>
              <TouchableOpacity onPress={() => setShowUserModal(false)}>
                <Ionicons name="close" size={24} color="#1C1C1E" />
              </TouchableOpacity>
            </View>

            {selectedUser && (
              <>
                <View style={styles.userDetailHeader}>
                  <View style={[styles.userDetailAvatar, { backgroundColor: `${getUserTypeColor(selectedUser.user_type)}20` }]}>
                    <Ionicons
                      name={selectedUser.user_type === 'driver' ? 'car' : 'person'}
                      size={40}
                      color={getUserTypeColor(selectedUser.user_type)}
                    />
                  </View>
                  <Text style={styles.userDetailName}>{selectedUser.name}</Text>
                  <Text style={styles.userDetailEmail}>{selectedUser.email}</Text>
                </View>

                <View style={styles.detailSection}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Phone</Text>
                    <Text style={styles.detailValue}>{selectedUser.phone || 'Not provided'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Type</Text>
                    <Text style={styles.detailValue}>
                      {selectedUser.user_type.charAt(0).toUpperCase() + selectedUser.user_type.slice(1)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Rating</Text>
                    <View style={styles.ratingContainer}>
                      <Ionicons name="star" size={16} color="#FFD700" />
                      <Text style={styles.detailValue}>{selectedUser.rating?.toFixed(1)}</Text>
                    </View>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Wallet</Text>
                    <Text style={styles.detailValue}>${selectedUser.wallet_balance?.toFixed(2)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Verified</Text>
                    <Text style={[styles.detailValue, { color: selectedUser.is_verified ? '#34C759' : '#FF3B30' }]}>
                      {selectedUser.is_verified ? 'Yes' : 'No'}
                    </Text>
                  </View>
                </View>

                {selectedUser.user_type === 'driver' && (
                  <View style={styles.driverActions}>
                    {selectedUser.is_verified ? (
                      <Button
                        title="Unverify Driver"
                        onPress={() => handleVerifyDriver(selectedUser.user_id, false)}
                        variant="danger"
                      />
                    ) : (
                      <Button
                        title="Verify Driver"
                        onPress={() => handleVerifyDriver(selectedUser.user_id, true)}
                        variant="secondary"
                      />
                    )}
                  </View>
                )}
              </>
            )}
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
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchTextInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    fontSize: 16,
  },
  filterContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
  },
  filterButtonActive: {
    backgroundColor: '#8E44AD',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
  },
  filterTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 16,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  userEmail: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  userMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    fontSize: 12,
    color: '#1C1C1E',
    marginLeft: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
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
    maxHeight: '80%',
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
  userDetailHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  userDetailAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  userDetailName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  userDetailEmail: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
  },
  detailSection: {
    backgroundColor: '#F2F2F7',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  detailLabel: {
    fontSize: 14,
    color: '#8E8E93',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverActions: {
    marginBottom: 20,
  },
});
