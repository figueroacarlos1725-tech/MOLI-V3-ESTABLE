import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Image,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/components/Button';
import * as WebBrowser from 'expo-web-browser';
import { useAuthStore } from '@/src/stores/authStore';

const { width } = Dimensions.get('window');

export default function WelcomeScreen() {
  const router = useRouter();
  const { socialLogin } = useAuthStore();

  const handleGoogleLogin = async () => {
    try {
      const redirectUrl = 'https://taxify-clone.preview.emergentagent.com/(auth)/callback';
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      
      if (result.type === 'success' && result.url) {
        const url = result.url;
        const sessionIdMatch = url.match(/session_id=([^&]+)/);
        if (sessionIdMatch) {
          await socialLogin(sessionIdMatch[1]);
          router.replace('/');
        }
      }
    } catch (error) {
      console.error('Error de login con Google:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.heroSection}>
          <View style={styles.logoImageContainer}>
            <Image
              source={require('../../assets/images/moli-splash.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.subtitle}>
            Tu viaje confiable, en cualquier momento y lugar
          </Text>
        </View>

        <View style={styles.featuresSection}>
          <View style={styles.featureItem}>
            <Ionicons name="location" size={24} color="#6BBF00" />
            <Text style={styles.featureText}>Seguimiento en tiempo real</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="shield-checkmark" size={24} color="#6BBF00" />
            <Text style={styles.featureText}>Viajes seguros y protegidos</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="wallet" size={24} color="#6BBF00" />
            <Text style={styles.featureText}>Multiples opciones de pago</Text>
          </View>
        </View>

        <View style={styles.buttonsSection}>
          <Button
            title="Continuar con Google"
            onPress={handleGoogleLogin}
            variant="outline"
            icon={<Ionicons name="logo-google" size={20} color="#6BBF00" />}
            style={styles.googleButton}
          />

          <Button
            title="Iniciar sesion con Email"
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
    marginTop: 20,
  },
  logoImageContainer: {
    width: 250,
    height: 200,
    marginBottom: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  logoImage: {
    width: 250,
    height: 200,
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
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  featureText: {
    fontSize: 16,
    color: '#FFFFFF',
    marginLeft: 16,
  },
  buttonsSection: {
    gap: 12,
  },
  googleButton: {
    marginBottom: 8,
    borderColor: '#6BBF00',
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
