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
import { MOLI_COLORS, MOLI_RADIUS } from '@/src/theme/colors';

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

  const isSelected = (role: UserRole) => selectedRole === role;

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
      >
        <Ionicons name="arrow-back" size={24} color={MOLI_COLORS.darkGray} />
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={styles.title}>¿Cómo vas a{"\n"}usar Moli?</Text>
        <Text style={styles.subtitle}>Elegí tu rol para empezar</Text>

        <View style={styles.optionsContainer}>
          <TouchableOpacity
            style={[
              styles.optionCard,
              isSelected('rider') && styles.optionCardSelected,
            ]}
            onPress={() => setSelectedRole('rider')}
            activeOpacity={0.7}
          >
            <View style={[
              styles.iconContainer,
              isSelected('rider') && styles.iconContainerSelected,
            ]}>
              <Ionicons
                name="person"
                size={32}
                color={isSelected('rider') ? MOLI_COLORS.primary : MOLI_COLORS.mediumGray}
              />
            </View>
            <View style={styles.optionTextContainer}>
              <Text style={[
                styles.optionTitle,
                isSelected('rider') && styles.optionTitleSelected,
              ]}>
                Pasajero
              </Text>
              <Text style={styles.optionDescription}>
                Pedí viajes y llegá a donde quieras
              </Text>
            </View>
            <View style={[styles.radio, isSelected('rider') && styles.radioSelected]}>
              {isSelected('rider') && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.optionCard,
              isSelected('driver') && styles.optionCardSelected,
            ]}
            onPress={() => setSelectedRole('driver')}
            activeOpacity={0.7}
          >
            <View style={[
              styles.iconContainer,
              isSelected('driver') && styles.iconContainerSelected,
            ]}>
              <Ionicons
                name="car-sport"
                size={32}
                color={isSelected('driver') ? MOLI_COLORS.primary : MOLI_COLORS.mediumGray}
              />
            </View>
            <View style={styles.optionTextContainer}>
              <Text style={[
                styles.optionTitle,
                isSelected('driver') && styles.optionTitleSelected,
              ]}>
                Conductor
              </Text>
              <Text style={styles.optionDescription}>
                Ganá dinero llevando pasajeros
              </Text>
            </View>
            <View style={[styles.radio, isSelected('driver') && styles.radioSelected]}>
              {isSelected('driver') && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>
        </View>

        <Button
          title="Continuar"
          onPress={handleContinue}
          disabled={!selectedRole}
          size="large"
          style={styles.continueButton}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MOLI_COLORS.white,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: MOLI_COLORS.offWhite,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 24,
    marginTop: 12,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 28,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: MOLI_COLORS.darkGray,
    marginBottom: 8,
    lineHeight: 40,
  },
  subtitle: {
    fontSize: 16,
    color: MOLI_COLORS.mediumGray,
    marginBottom: 40,
  },
  optionsContainer: {
    gap: 14,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MOLI_COLORS.offWhite,
    borderRadius: MOLI_RADIUS.lg,
    padding: 20,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionCardSelected: {
    borderColor: MOLI_COLORS.primary,
    backgroundColor: MOLI_COLORS.primaryGlow,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: MOLI_COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainerSelected: {
    backgroundColor: MOLI_COLORS.white,
  },
  optionTextContainer: {
    flex: 1,
    marginLeft: 16,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: MOLI_COLORS.darkGray,
    marginBottom: 4,
  },
  optionTitleSelected: {
    color: MOLI_COLORS.primary,
  },
  optionDescription: {
    fontSize: 14,
    color: MOLI_COLORS.mediumGray,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: MOLI_COLORS.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    borderColor: MOLI_COLORS.primary,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: MOLI_COLORS.primary,
  },
  continueButton: {
    marginTop: 40,
  },
});
