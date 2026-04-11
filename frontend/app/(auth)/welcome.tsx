import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/components/Button';

const { width } = Dimensions.get('window');

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.heroSection}>
          {/* Logo text styled */}
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>MOLI</Text>
            <View style={styles.logoDot} />
          </View>
          <Text style={styles.subtitle}>
            Tu viaje confiable, en cualquier momento y lugar
          </Text>
        </View>

        <View style={styles.featuresSection}>
          <View style={styles.featureItem}>
            <View style={styles.featureIcon}>
              <Ionicons name="location" size={22} color="#A855F7" />
            </View>
            <Text style={styles.featureText}>Seguimiento en tiempo real</Text>
          </View>
          <View style={styles.featureItem}>
            <View style={styles.featureIcon}>
              <Ionicons name="shield-checkmark" size={22} color="#A855F7" />
            </View>
            <Text style={styles.featureText}>Viajes seguros y protegidos</Text>
          </View>
          <View style={styles.featureItem}>
            <View style={styles.featureIcon}>
              <Ionicons name="wallet" size={22} color="#A855F7" />
            </View>
            <Text style={styles.featureText}>Multiples opciones de pago</Text>
          </View>
        </View>

        <View style={styles.buttonsSection}>
          <Button
            title="Iniciar sesion"
            onPress={() => router.push('/(auth)/login')}
            variant="primary"
            style={styles.button}
          />

          <Button
            title="Crear cuenta"
            onPress={() => router.push('/(auth)/select-role')}
            variant="secondary"
            style={styles.button}
          />
        </View>

        <Text style={styles.termsText}>
          Al continuar, aceptas nuestros Terminos de Servicio y Politica de Privacidad
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingVertical: 40,
  },
  heroSection: {
    alignItems: 'center',
    marginTop: 40,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoText: {
    fontSize: 64,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 8,
  },
  logoDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#A855F7',
    marginLeft: 4,
    marginTop: 20,
  },
  subtitle: {
    fontSize: 16,
    color: '#AEAEAE',
    textAlign: 'center',
  },
  featuresSection: {
    marginVertical: 24,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    paddingHorizontal: 20,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(168,85,247,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    fontSize: 16,
    color: '#FFFFFF',
    marginLeft: 16,
    fontWeight: '500',
  },
  buttonsSection: {
    gap: 12,
  },
  button: {
    width: '100%',
  },
  termsText: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 24,
  },
});
