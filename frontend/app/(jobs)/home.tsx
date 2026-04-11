import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';

const { width } = Dimensions.get('window');

export default function JobsHomeScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const iconScale = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const contentY = useSharedValue(30);

  useEffect(() => {
    iconScale.value = withDelay(200, withSpring(1, { damping: 10, stiffness: 80 }));
    contentOpacity.value = withDelay(500, withTiming(1, { duration: 600 }));
    contentY.value = withDelay(500, withSpring(0, { damping: 15 }));
  }, []);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentY.value }],
  }));

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.replace('/modules')}
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Molí Trabajos</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.content}>
        <Animated.View style={[s.iconWrapper, iconStyle]}>
          <View style={s.iconBg}>
            <Ionicons name="construct" size={64} color="#007AFF" />
          </View>
        </Animated.View>

        <Animated.View style={[s.textContent, contentStyle]}>
          <Text style={s.title}>¡Próximamente!</Text>
          <Text style={s.description}>
            Estamos preparando algo increíble.{"\n\n"}
            Pronto vas a poder contratar profesionales para cualquier trabajo{"\n"}
            o ofrecer tus servicios y generar ingresos extra.
          </Text>

          <View style={s.featuresList}>
            <View style={s.featureItem}>
              <View style={s.featureDot} />
              <Text style={s.featureText}>Publicá trabajos con fotos y presupuesto</Text>
            </View>
            <View style={s.featureItem}>
              <View style={s.featureDot} />
              <Text style={s.featureText}>Recibí ofertas de profesionales verificados</Text>
            </View>
            <View style={s.featureItem}>
              <View style={s.featureDot} />
              <Text style={s.featureText}>Seguimiento en tiempo real del profesional</Text>
            </View>
            <View style={s.featureItem}>
              <View style={s.featureDot} />
              <Text style={s.featureText}>Pagos seguros con garantía</Text>
            </View>
          </View>
        </Animated.View>

        <TouchableOpacity
          style={s.backButton}
          onPress={() => router.replace('/modules')}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={18} color="#fff" />
          <Text style={s.backButtonText}>Volver al inicio</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  iconWrapper: {
    marginBottom: 32,
  },
  iconBg: {
    width: 120,
    height: 120,
    borderRadius: 36,
    backgroundColor: 'rgba(0,122,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContent: {
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  featuresList: {
    alignSelf: 'stretch',
    gap: 14,
    marginBottom: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007AFF',
  },
  featureText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '500',
    flex: 1,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 36,
  },
  backButtonText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
});
