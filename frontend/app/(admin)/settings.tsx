import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/src/services/api';
import { Button } from '@/src/components/Button';
import { useAuthStore } from '@/src/stores/authStore';
import { useRouter } from 'expo-router';

interface Settings {
  map_provider: string;
  base_fare: number;
  per_km_rate: number;
  per_minute_rate: number;
  commission_rate: number;
  currency: string;
  google_maps_key?: string;
  mapbox_key?: string;
  mercadopago_public_key?: string;
  mercadopago_access_token?: string;
  astropay_api_key?: string;
  astropay_secret_key?: string;
}

export default function AdminSettingsScreen() {
  const router = useRouter();
  const { logout } = useAuthStore();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<Partial<Settings>>({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await apiService.get('/admin/settings');
      setSettings(response);
      setFormData(response);
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      await apiService.put('/admin/settings', formData);
      Alert.alert('Success', 'Settings saved successfully');
      setEditMode(false);
      fetchSettings();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/welcome');
          },
        },
      ]
    );
  };

  const renderSettingInput = (label: string, key: keyof Settings, placeholder?: string, secureEntry?: boolean) => (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      {editMode ? (
        <TextInput
          style={styles.settingInput}
          value={String(formData[key] || '')}
          onChangeText={(value) => setFormData({ ...formData, [key]: value })}
          placeholder={placeholder}
          secureTextEntry={secureEntry}
        />
      ) : (
        <Text style={styles.settingValue}>
          {secureEntry && settings?.[key] ? '****' + String(settings[key]).slice(-4) : String(settings?.[key] || 'Not set')}
        </Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => editMode ? handleSaveSettings() : setEditMode(true)}
        >
          {isSaving ? (
            <Text style={styles.editButtonText}>Saving...</Text>
          ) : (
            <Text style={styles.editButtonText}>{editMode ? 'Save' : 'Edit'}</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Map Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Map Configuration</Text>
          <View style={styles.sectionCard}>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Map Provider</Text>
              <View style={styles.providerSelector}>
                {['osm', 'google', 'mapbox'].map((provider) => (
                  <TouchableOpacity
                    key={provider}
                    style={[
                      styles.providerButton,
                      (editMode ? formData.map_provider : settings?.map_provider) === provider && styles.providerButtonActive
                    ]}
                    onPress={() => editMode && setFormData({ ...formData, map_provider: provider })}
                    disabled={!editMode}
                  >
                    <Text style={[
                      styles.providerButtonText,
                      (editMode ? formData.map_provider : settings?.map_provider) === provider && styles.providerButtonTextActive
                    ]}>
                      {provider.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {renderSettingInput('Google Maps API Key', 'google_maps_key', 'Enter API key', true)}
            {renderSettingInput('Mapbox API Key', 'mapbox_key', 'Enter API key', true)}
          </View>
        </View>

        {/* Fare Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fare Configuration</Text>
          <View style={styles.sectionCard}>
            {renderSettingInput('Base Fare ($)', 'base_fare', '2.50')}
            {renderSettingInput('Per KM Rate ($)', 'per_km_rate', '1.20')}
            {renderSettingInput('Per Minute Rate ($)', 'per_minute_rate', '0.15')}
            {renderSettingInput('Commission Rate (%)', 'commission_rate', '0.20')}
            {renderSettingInput('Currency', 'currency', 'USD')}
          </View>
        </View>

        {/* Payment Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Gateways</Text>
          <View style={styles.sectionCard}>
            <Text style={styles.gatewayTitle}>MercadoPago</Text>
            {renderSettingInput('Public Key', 'mercadopago_public_key', 'Enter public key', true)}
            {renderSettingInput('Access Token', 'mercadopago_access_token', 'Enter access token', true)}
            
            <View style={styles.gatewayDivider} />
            
            <Text style={styles.gatewayTitle}>AstroPay</Text>
            {renderSettingInput('API Key', 'astropay_api_key', 'Enter API key', true)}
            {renderSettingInput('Secret Key', 'astropay_secret_key', 'Enter secret key', true)}
          </View>
        </View>

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.versionText}>TaxiRide Admin v1.0.0</Text>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  editButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#8E44AD',
    borderRadius: 20,
  },
  editButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  settingRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  settingLabel: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 8,
  },
  settingValue: {
    fontSize: 16,
    color: '#1C1C1E',
  },
  settingInput: {
    fontSize: 16,
    color: '#1C1C1E',
    backgroundColor: '#F2F2F7',
    padding: 12,
    borderRadius: 8,
  },
  providerSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  providerButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
  },
  providerButtonActive: {
    backgroundColor: '#8E44AD',
  },
  providerButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
  },
  providerButtonTextActive: {
    color: '#fff',
  },
  gatewayTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
    marginTop: 8,
  },
  gatewayDivider: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginVertical: 16,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  logoutText: {
    fontSize: 16,
    color: '#FF3B30',
    marginLeft: 12,
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#8E8E93',
    marginVertical: 32,
  },
});
