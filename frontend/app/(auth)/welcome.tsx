import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Linking,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/components/Button';
import { MOLI_COLORS } from '@/src/theme/colors';

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
        <View style={styles.orbTop} />
        <View style={styles.orbBottom} />
        {/* Hero */}
        <Animated.View style={[styles.heroSection, { opacity: fadeAnim }]}>
          <View style={styles.brandRow}>
            <View style={styles.routePin}><Text style={styles.routeM}>M</Text><View style={styles.pinTip} /></View>
            <Text style={styles.wordmark}>Moli</Text>
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: fadeAnim }}>
          <Text style={styles.eyebrow}>TU CIUDAD, MÁS CERCA</Text>
          <Text style={styles.headline}>Todo lo que necesitás, en movimiento.</Text>
          <Text style={styles.subtitle}>Viajá, pedí un servicio o recibí tus compras desde un solo lugar.</Text>
        </Animated.View>

        {/* Features */}
        <Animated.View style={[styles.featuresSection, { opacity: fadeAnim }]}>
          {[
            { icon: 'navigate', text: 'Viajes y envíos en tiempo real' },
            { icon: 'construct', text: 'Profesionales verificados' },
            { icon: 'storefront', text: 'Comercios de tu ciudad' },
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
            style={{ ...styles.button, ...styles.outlineBtn }}
            textStyle={styles.outlineText}
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
    backgroundColor: MOLI_COLORS.surface,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    paddingBottom: 32,
  },
  heroSection: {
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  routePin: { width: 50, height: 50, borderRadius: 17, borderBottomRightRadius: 26, backgroundColor: MOLI_COLORS.primary, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '8deg' }] },
  pinTip: { position: 'absolute', right: 3, bottom: -4, width: 12, height: 12, backgroundColor: MOLI_COLORS.primary, transform: [{ rotate: '22deg' }] },
  routeM: { color: '#fff', fontWeight: '900', fontSize: 24, zIndex: 2, transform: [{ rotate: '-8deg' }] },
  wordmark: { color: MOLI_COLORS.black, fontSize: 38, fontWeight: '900', letterSpacing: -1 },
  eyebrow: { color: MOLI_COLORS.primaryDark, fontWeight: '800', fontSize: 12, letterSpacing: 1.8, marginBottom: 10 },
  headline: { color: MOLI_COLORS.black, fontSize: 34, lineHeight: 40, fontWeight: '800', maxWidth: 480 },
  orbTop: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(255,90,60,.08)', top: -140, right: -130 },
  orbBottom: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(32,33,36,.035)', bottom: -150, left: -100 },
  subtitle: {
    fontSize: 17,
    color: MOLI_COLORS.gray,
    marginTop: 12,
    marginBottom: 28,
    letterSpacing: 0.3,
  },
  featuresSection: {
    marginBottom: 32,
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
    backgroundColor: MOLI_COLORS.primaryGlow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    fontSize: 15,
    color: MOLI_COLORS.darkGray,
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
    borderColor: MOLI_COLORS.lightGray,
    backgroundColor: MOLI_COLORS.white,
  },
  outlineText: { color: MOLI_COLORS.darkGray },
  termsText: {
    fontSize: 12,
    color: MOLI_COLORS.mediumGray,
    textAlign: 'center',
    lineHeight: 18,
  },
});
