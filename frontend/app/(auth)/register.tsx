import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Input } from '@/src/components/Input';
import { Button } from '@/src/components/Button';
import { useAuthStore } from '@/src/stores/authStore';
import { MOLI_COLORS, MOLI_RADIUS } from '@/src/theme/colors';

export default function RegisterScreen() {
  const router = useRouter();
  const { role, isPro } = useLocalSearchParams<{ role: string; isPro?: string }>();
  const { register } = useAuthStore();
  const isProfessional = isPro === '1';
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    vehicle_make: '',
    vehicle_model: '',
    vehicle_year: '',
    vehicle_color: '',
    plate_number: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const userType = role || 'rider';
  const isDriver = userType === 'driver' && !isProfessional;

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Requerido';
    if (!formData.email.trim()) newErrors.email = 'Requerido';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Email inválido';
    if (!formData.phone.trim()) newErrors.phone = 'Requerido';
    if (!formData.password) newErrors.password = 'Requerido';
    else if (formData.password.length < 6) newErrors.password = 'Mínimo 6 caracteres';
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'No coinciden';
    }
    if (isDriver) {
      if (!formData.vehicle_make.trim()) newErrors.vehicle_make = 'Requerido';
      if (!formData.vehicle_model.trim()) newErrors.vehicle_model = 'Requerido';
      if (!formData.plate_number.trim()) newErrors.plate_number = 'Requerido';
      if (!formData.vehicle_color.trim()) newErrors.vehicle_color = 'Requerido';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    setIsLoading(true);
    try {
      await register({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
        user_type: userType,
        is_professional: isProfessional,
        ...(isDriver ? {
          vehicle_make: formData.vehicle_make,
          vehicle_model: formData.vehicle_model,
          vehicle_year: formData.vehicle_year,
          vehicle_color: formData.vehicle_color,
          plate_number: formData.plate_number,
        } : {}),
      });
      // Drivers go directly to documents upload, riders go to home
      if (isDriver) {
        router.replace('/(driver)/home' as any);
      } else {
        router.replace('/');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Intentá de nuevo');
    } finally {
      setIsLoading(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color={MOLI_COLORS.darkGray} />
          </TouchableOpacity>

          <View style={styles.headerSection}>
            <View style={[styles.roleChip, (isDriver || isProfessional) && styles.roleChipDriver]}>
              <Ionicons
                name={isProfessional ? 'construct' : isDriver ? 'car-sport' : 'person'}
                size={18}
                color={MOLI_COLORS.primary}
              />
              <Text style={styles.roleChipText}>
                {isProfessional ? 'Profesional' : isDriver ? 'Conductor' : 'Pasajero'}
              </Text>
            </View>
            <Text style={styles.title}>Creá tu cuenta</Text>
            <Text style={styles.subtitle}>
              {isProfessional
                ? 'Ofrecé tus servicios en Moli Trabajos'
                : isDriver
                  ? 'Unite a Moli y empezá a ganar'
                  : 'Registrate para pedir tu primer viaje'
              }
            </Text>
          </View>

          <View style={styles.formSection}>
            <Input
              label="Nombre completo"
              placeholder="Tu nombre"
              value={formData.name}
              onChangeText={(v) => updateField('name', v)}
              leftIcon="person-outline"
              autoCapitalize="words"
              error={errors.name}
            />

            <Input
              label="Email"
              placeholder="tu@email.com"
              value={formData.email}
              onChangeText={(v) => updateField('email', v)}
              keyboardType="email-address"
              autoCapitalize="none"
              leftIcon="mail-outline"
              error={errors.email}
            />

            <Input
              label="Teléfono"
              placeholder="+54 9 XXX XXX XXXX"
              value={formData.phone}
              onChangeText={(v) => updateField('phone', v)}
              keyboardType="phone-pad"
              leftIcon="call-outline"
              error={errors.phone}
            />

            <Input
              label="Contraseña"
              placeholder="Mínimo 6 caracteres"
              value={formData.password}
              onChangeText={(v) => updateField('password', v)}
              secureTextEntry
              leftIcon="lock-closed-outline"
              error={errors.password}
            />

            <Input
              label="Confirmar contraseña"
              placeholder="Repetí tu contraseña"
              value={formData.confirmPassword}
              onChangeText={(v) => updateField('confirmPassword', v)}
              secureTextEntry
              leftIcon="lock-closed-outline"
              error={errors.confirmPassword}
            />

            {isDriver && (
              <>
                <View style={{ marginTop: 16, marginBottom: 8 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#1C1C1E' }}>Datos del vehículo</Text>
                  <Text style={{ fontSize: 12, color: '#8E8E93', marginTop: 2 }}>Esta información se mostrará al pasajero</Text>
                </View>
                <Input
                  label="Marca"
                  placeholder="Ej: Toyota, Volkswagen, Honda"
                  value={formData.vehicle_make}
                  onChangeText={(v) => updateField('vehicle_make', v)}
                  leftIcon="car-outline"
                  autoCapitalize="words"
                  error={errors.vehicle_make}
                />
                <Input
                  label="Modelo"
                  placeholder="Ej: Corolla, Gol, CBR"
                  value={formData.vehicle_model}
                  onChangeText={(v) => updateField('vehicle_model', v)}
                  leftIcon="car-sport-outline"
                  autoCapitalize="words"
                  error={errors.vehicle_model}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Input
                      label="Año"
                      placeholder="2020"
                      value={formData.vehicle_year}
                      onChangeText={(v) => updateField('vehicle_year', v)}
                      keyboardType="number-pad"
                      leftIcon="calendar-outline"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Input
                      label="Color"
                      placeholder="Blanco, Negro..."
                      value={formData.vehicle_color}
                      onChangeText={(v) => updateField('vehicle_color', v)}
                      leftIcon="color-palette-outline"
                      autoCapitalize="words"
                      error={errors.vehicle_color}
                    />
                  </View>
                </View>
                <Input
                  label="Patente"
                  placeholder="ABC 123 o AB 123 CD"
                  value={formData.plate_number}
                  onChangeText={(v) => updateField('plate_number', v.toUpperCase())}
                  leftIcon="document-text-outline"
                  autoCapitalize="characters"
                  error={errors.plate_number}
                />
              </>
            )}

            <Button
              title="Crear cuenta"
              onPress={handleRegister}
              loading={isLoading}
              size="large"
              style={styles.registerButton}
            />
          </View>

          <View style={styles.footerSection}>
            <Text style={styles.footerText}>¿Ya tenés cuenta? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
              <Text style={styles.signInText}>Iniciá sesión</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MOLI_COLORS.white,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 32,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: MOLI_COLORS.offWhite,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerSection: {
    marginTop: 20,
    marginBottom: 32,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MOLI_COLORS.primaryGlow,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: MOLI_RADIUS.full,
    alignSelf: 'flex-start',
    marginBottom: 16,
    gap: 6,
  },
  roleChipDriver: {
    backgroundColor: MOLI_COLORS.primaryGlow,
  },
  roleChipText: {
    color: MOLI_COLORS.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: MOLI_COLORS.darkGray,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: MOLI_COLORS.mediumGray,
    lineHeight: 22,
  },
  formSection: {
    flex: 1,
  },
  registerButton: {
    marginTop: 16,
    marginBottom: 20,
  },
  footerSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: 16,
    paddingBottom: 40,
  },
  footerText: {
    color: MOLI_COLORS.mediumGray,
    fontSize: 15,
  },
  signInText: {
    color: MOLI_COLORS.primary,
    fontSize: 15,
    fontWeight: '700',
  },
});
