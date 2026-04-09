import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/components/Button';

type UserRole = 'rider' | 'driver';

export default function SelectRoleScreen() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);

  const handleContinue = () => {
    if (selectedRole) {
      router.push({
        pathname: '/(auth)/register',
        params: { role: selectedRole },
      });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
      >
        <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={styles.title}>Join as</Text>
        <Text style={styles.subtitle}>Choose how you want to use TaxiRide</Text>

        <View style={styles.optionsContainer}>
          <TouchableOpacity
            style={[
              styles.optionCard,
              selectedRole === 'rider' && styles.optionCardSelected,
            ]}
            onPress={() => setSelectedRole('rider')}
          >
            <View style={[
              styles.iconContainer,
              selectedRole === 'rider' && styles.iconContainerSelected,
            ]}>
              <Ionicons
                name="person"
                size={40}
                color={selectedRole === 'rider' ? '#007AFF' : '#8E8E93'}
              />
            </View>
            <Text style={[
              styles.optionTitle,
              selectedRole === 'rider' && styles.optionTitleSelected,
            ]}>
              Rider
            </Text>
            <Text style={styles.optionDescription}>
              Book rides and travel comfortably
            </Text>
            {selectedRole === 'rider' && (
              <View style={styles.checkmark}>
                <Ionicons name="checkmark-circle" size={24} color="#007AFF" />
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.optionCard,
              selectedRole === 'driver' && styles.optionCardSelected,
            ]}
            onPress={() => setSelectedRole('driver')}
          >
            <View style={[
              styles.iconContainer,
              selectedRole === 'driver' && styles.iconContainerSelected,
            ]}>
              <Ionicons
                name="car-sport"
                size={40}
                color={selectedRole === 'driver' ? '#34C759' : '#8E8E93'}
              />
            </View>
            <Text style={[
              styles.optionTitle,
              selectedRole === 'driver' && styles.optionTitleSelectedDriver,
            ]}>
              Driver
            </Text>
            <Text style={styles.optionDescription}>
              Earn money by driving passengers
            </Text>
            {selectedRole === 'driver' && (
              <View style={styles.checkmark}>
                <Ionicons name="checkmark-circle" size={24} color="#34C759" />
              </View>
            )}
          </TouchableOpacity>
        </View>

        <Button
          title="Continue"
          onPress={handleContinue}
          disabled={!selectedRole}
          variant={selectedRole === 'driver' ? 'secondary' : 'primary'}
          style={styles.continueButton}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    marginLeft: 16,
    marginTop: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
    marginBottom: 40,
  },
  optionsContainer: {
    gap: 16,
  },
  optionCard: {
    backgroundColor: '#F2F2F7',
    borderRadius: 16,
    padding: 24,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  optionCardSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#F0F8FF',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconContainerSelected: {
    backgroundColor: '#fff',
  },
  optionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  optionTitleSelected: {
    color: '#007AFF',
  },
  optionTitleSelectedDriver: {
    color: '#34C759',
  },
  optionDescription: {
    fontSize: 14,
    color: '#8E8E93',
  },
  checkmark: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
  continueButton: {
    marginTop: 40,
  },
});
