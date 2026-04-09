import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  SafeAreaView,
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
      // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
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
      console.error('Google login error:', error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.heroSection}>
          <View style={styles.iconContainer}>
            <Ionicons name="car-sport" size={80} color="#007AFF" />
          </View>
          <Text style={styles.title}>TaxiRide</Text>
          <Text style={styles.subtitle}>
            Your reliable ride, anytime, anywhere
          </Text>
        </View>

        <View style={styles.featuresSection}>
          <View style={styles.featureItem}>
            <Ionicons name="location" size={24} color="#34C759" />
            <Text style={styles.featureText}>Real-time tracking</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="shield-checkmark" size={24} color="#34C759" />
            <Text style={styles.featureText}>Safe & secure rides</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="wallet" size={24} color="#34C759" />
            <Text style={styles.featureText}>Multiple payment options</Text>
          </View>
        </View>

        <View style={styles.buttonsSection}>
          <Button
            title="Continue with Google"
            onPress={handleGoogleLogin}
            variant="outline"
            icon={<Ionicons name="logo-google" size={20} color="#007AFF" />}
            style={styles.googleButton}
          />

          <Button
            title="Sign in with Email"
            onPress={() => router.push('/(auth)/login')}
            variant="primary"
            style={styles.button}
          />

          <Button
            title="Create Account"
            onPress={() => router.push('/(auth)/select-role')}
            variant="secondary"
            style={styles.button}
          />
        </View>

        <Text style={styles.termsText}>
          By continuing, you agree to our Terms of Service and Privacy Policy
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
  iconContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#F0F8FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
  },
  featuresSection: {
    marginVertical: 32,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  featureText: {
    fontSize: 16,
    color: '#1C1C1E',
    marginLeft: 16,
  },
  buttonsSection: {
    gap: 12,
  },
  googleButton: {
    marginBottom: 8,
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
