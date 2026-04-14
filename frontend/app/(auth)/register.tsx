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
  const { role } = useLocalSearchParams<{ role: string }>();
  const { register } = useAuthStore();
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const userType = role || 'rider';
  const isDriver = userType === 'driver';

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
      });
      router.replace('/');
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
            <View style={[styles.roleChip, isDriver && styles.roleChipDriver]}>
              <Ionicons
                name={isDriver ? 'car-sport' : 'person'}
                size={18}
                color={MOLI_COLORS.primary}
              />
              <Text style={styles.roleChipText}>
                {isDriver ? 'Conductor' : 'Pasajero'}
              </Text>
            </View>
            <Text style={styles.title}>Creá tu cuenta</Text>
            <Text style={styles.subtitle}>
              {isDriver
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
