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
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Input } from '@/src/components/Input';
import { Button } from '@/src/components/Button';
import { useAuthStore } from '@/src/stores/authStore';
import { MOLI_COLORS } from '@/src/theme/colors';
import { AUTH_FEATURES } from '@/src/config/features';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {};
    if (!email) newErrors.email = 'El email es requerido';
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Formato de email inválido';
    if (!password) newErrors.password = 'La contraseña es requerida';
    else if (password.length < 6) newErrors.password = 'Mínimo 6 caracteres';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setIsLoading(true);
    try {
      await login(email, password);
      router.replace('/');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Credenciales inválidas');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!AUTH_FEATURES.google || !AUTH_FEATURES.googleAuthUrl) {
      Alert.alert('Google estará disponible pronto', 'La pantalla ya está preparada. Falta vincular las credenciales OAuth de Moli antes de habilitarla.');
      return;
    }
    const canOpen = await Linking.canOpenURL(AUTH_FEATURES.googleAuthUrl);
    if (!canOpen) {
      Alert.alert('No pudimos abrir Google', 'Intentá nuevamente en unos minutos.');
      return;
    }
    await Linking.openURL(AUTH_FEATURES.googleAuthUrl);
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
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color={MOLI_COLORS.darkGray} />
          </TouchableOpacity>

          <View style={styles.brandRow}>
            <View style={styles.brandMark}><Ionicons name="sparkles" size={20} color={MOLI_COLORS.white} /></View>
            <Text style={styles.brand}>Moli</Text>
          </View>

          <View style={styles.headerSection}>
            <Text style={styles.eyebrow}>TODO RESUELTO, EN UN SOLO LUGAR</Text>
            <Text style={styles.title}>Bienvenido de nuevo</Text>
            <Text style={styles.subtitle}>Ingresá para encontrar profesionales y seguir tus solicitudes.</Text>
          </View>

          <View style={styles.formSection}>
            <Input
              label="Email"
              placeholder="tu@email.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              leftIcon="mail-outline"
              error={errors.email}
            />

            <Input
              label="Contraseña"
              placeholder="Tu contraseña"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              leftIcon="lock-closed-outline"
              error={errors.password}
            />

            <TouchableOpacity style={styles.forgotPassword}>
              <Text style={styles.forgotPasswordText}>¿Olvidaste tu contraseña?</Text>
            </TouchableOpacity>

            <Button
              title="Ingresar"
              onPress={handleLogin}
              loading={isLoading}
              size="large"
              style={styles.loginButton}
            />

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>o continuá con</Text>
              <View style={styles.divider} />
            </View>

            <TouchableOpacity style={styles.googleButton} onPress={handleGoogleLogin} accessibilityRole="button">
              <Text style={styles.googleLetter}>G</Text>
              <Text style={styles.googleText}>Continuar con Google</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footerSection}>
            <Text style={styles.footerText}>¿No tenés cuenta? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/select-role')}>
              <Text style={styles.signUpText}>Registrate</Text>
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
    backgroundColor: MOLI_COLORS.surface,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: MOLI_COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  brandMark: { width: 38, height: 38, borderRadius: 13, backgroundColor: MOLI_COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  headerSection: {
    marginTop: 44,
    marginBottom: 30,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: MOLI_COLORS.darkGray,
    marginBottom: 8,
    lineHeight: 40,
  },
  subtitle: {
    fontSize: 16,
    color: MOLI_COLORS.mediumGray,
  },
  brand: { color: MOLI_COLORS.navy, fontSize: 25, fontWeight: '900', letterSpacing: -0.8 },
  eyebrow: { color: MOLI_COLORS.primaryDark, fontSize: 11, fontWeight: '900', letterSpacing: 1.3, marginBottom: 10 },
  formSection: {
    flex: 1,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 28,
  },
  forgotPasswordText: {
    color: MOLI_COLORS.primaryDark,
    fontSize: 14,
    fontWeight: '600',
  },
  loginButton: {
    marginTop: 4,
  },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 24 },
  divider: { flex: 1, height: 1, backgroundColor: MOLI_COLORS.lightGray },
  dividerText: { color: MOLI_COLORS.mediumGray, fontSize: 12, fontWeight: '600' },
  googleButton: { minHeight: 56, borderRadius: 18, borderWidth: 1, borderColor: MOLI_COLORS.lightGray, backgroundColor: MOLI_COLORS.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  googleLetter: { fontSize: 21, fontWeight: '900', color: '#4285F4' },
  googleText: { fontSize: 16, fontWeight: '700', color: MOLI_COLORS.darkGray },
  footerSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 28,
  },
  footerText: {
    color: MOLI_COLORS.mediumGray,
    fontSize: 15,
  },
  signUpText: {
    color: MOLI_COLORS.primary,
    fontSize: 15,
    fontWeight: '700',
  },
});
