import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
  Image,
  Linking,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/components/Button';
import { MOLI_COLORS, MOLI_RADIUS } from '@/src/theme/colors';

const { width } = Dimensions.get('window');

export default function WelcomeScreen() {
  const router = useRouter();
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(30));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Hero */}
        <Animated.View style={[styles.heroSection, { opacity: fadeAnim }]}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.Text style={[styles.subtitle, { opacity: fadeAnim }]}>
          Movete libre por tu ciudad
        </Animated.Text>

        {/* Features */}
        <Animated.View style={[styles.featuresSection, { opacity: fadeAnim }]}>
          {[
            { icon: 'navigate', text: 'Viajes seguros en tiempo real' },
            { icon: 'flash', text: 'Llegamos en minutos' },
            { icon: 'wallet', text: 'Pagá como quieras' },
          ].map((f, i) => (
            <View key={i} style={styles.featureItem}>
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon as any} size={20} color={MOLI_COLORS.primary} />
              </View>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          ))}
        </Animated.View>

        {/* Buttons */}
        <Animated.View style={[styles.buttonsSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Button
            title="Iniciar sesión"
            onPress={() => router.push('/(auth)/login')}
            variant="primary"
            size="large"
            style={styles.button}
          />

          <Button
            title="Crear cuenta"
            onPress={() => router.push('/(auth)/select-role')}
            variant="outline"
            size="large"
            style={[styles.button, styles.outlineBtn]}
            textStyle={{ color: MOLI_COLORS.white }}
          />
        </Animated.View>

        <TouchableOpacity onPress={() => Linking.openURL(`${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/legal/terms`)}>
          <Text style={styles.termsText}>
            Al continuar, aceptás nuestros Términos y Política de Privacidad
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MOLI_COLORS.black,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    paddingBottom: 32,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 8,
  },
  logo: {
    width: 140,
    height: 140,
    borderRadius: 32,
  },
  subtitle: {
    fontSize: 17,
    color: MOLI_COLORS.mediumGray,
    textAlign: 'center',
    marginBottom: 40,
    letterSpacing: 0.3,
  },
  featuresSection: {
    marginBottom: 48,
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 200, 83, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    fontSize: 15,
    color: MOLI_COLORS.white,
    marginLeft: 14,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  buttonsSection: {
    gap: 12,
    marginBottom: 24,
  },
  button: {
    width: '100%',
  },
  outlineBtn: {
    borderColor: 'rgba(255,255,255,0.2)',
  },
  termsText: {
    fontSize: 12,
    color: MOLI_COLORS.gray,
    textAlign: 'center',
    lineHeight: 18,
  },
});
