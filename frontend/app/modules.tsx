import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');

export default function ModuleSelectionScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  // Animations
  const headerOpacity = useSharedValue(0);
  const headerTranslateY = useSharedValue(-20);
  const card1Scale = useSharedValue(0.8);
  const card1Opacity = useSharedValue(0);
  const card2Scale = useSharedValue(0.8);
  const card2Opacity = useSharedValue(0);
  const footerOpacity = useSharedValue(0);

  useEffect(() => {
    // Staggered entrance animations
    headerOpacity.value = withDelay(100, withTiming(1, { duration: 500 }));
    headerTranslateY.value = withDelay(100, withSpring(0, { damping: 15 }));

    card1Opacity.value = withDelay(300, withTiming(1, { duration: 400 }));
    card1Scale.value = withDelay(300, withSpring(1, { damping: 12, stiffness: 100 }));

    card2Opacity.value = withDelay(500, withTiming(1, { duration: 400 }));
    card2Scale.value = withDelay(500, withSpring(1, { damping: 12, stiffness: 100 }));

    footerOpacity.value = withDelay(700, withTiming(1, { duration: 500 }));
  }, []);

  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ translateY: headerTranslateY.value }],
  }));

  const card1Style = useAnimatedStyle(() => ({
    opacity: card1Opacity.value,
    transform: [{ scale: card1Scale.value }],
  }));

  const card2Style = useAnimatedStyle(() => ({
    opacity: card2Opacity.value,
    transform: [{ scale: card2Scale.value }],
  }));

  const footerStyle = useAnimatedStyle(() => ({
    opacity: footerOpacity.value,
  }));

  const handleViajes = () => {
    // Navigate based on user type
    if (user?.user_type === 'driver') {
      router.replace('/(driver)/home');
    } else {
      router.replace('/(rider)/home');
    }
  };

  const handleTrabajos = () => {
    // For now, show coming soon - will be implemented later
    // Could navigate to /(jobs)/home in the future
    router.replace('/(jobs)/home');
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.content}>
        {/* Header */}
        <Animated.View style={[s.header, headerStyle]}>
          <View style={s.logoRow}>
            <Text style={s.logoText}>MOLÍ</Text>
            <View style={s.logoDot} />
          </View>
          <Text style={s.greeting}>
            Hola, {user?.name?.split(' ')[0] || 'Usuario'}
          </Text>
          <Text style={s.subtitle}>¿Qué necesitás hoy?</Text>
        </Animated.View>

        {/* Module Cards */}
        <View style={s.cardsContainer}>
          {/* Molí Viajes */}
          <Animated.View style={[s.cardWrapper, card1Style]}>
            <TouchableOpacity
              style={[s.card, s.cardViajes]}
              onPress={handleViajes}
              activeOpacity={0.85}
            >
              <View style={s.cardIconContainer}>
                <View style={[s.cardIconBg, { backgroundColor: 'rgba(107,191,0,0.15)' }]}>
                  <Ionicons name="car-sport" size={40} color="#6BBF00" />
                </View>
              </View>
              <View style={s.cardContent}>
                <Text style={s.cardTitle}>Molí Viajes</Text>
                <Text style={s.cardDescription}>
                  Pedí un viaje o conducí{'\n'}y generá ingresos
                </Text>
              </View>
              <View style={[s.cardArrow, { backgroundColor: 'rgba(107,191,0,0.1)' }]}>
                <Ionicons name="arrow-forward" size={22} color="#6BBF00" />
              </View>
              <View style={[s.cardAccent, { backgroundColor: '#6BBF00' }]} />
            </TouchableOpacity>
          </Animated.View>

          {/* Molí Trabajos */}
          <Animated.View style={[s.cardWrapper, card2Style]}>
            <TouchableOpacity
              style={[s.card, s.cardTrabajos]}
              onPress={handleTrabajos}
              activeOpacity={0.85}
            >
              <View style={s.cardIconContainer}>
                <View style={[s.cardIconBg, { backgroundColor: 'rgba(0,122,255,0.12)' }]}>
                  <Ionicons name="construct" size={40} color="#007AFF" />
                </View>
              </View>
              <View style={s.cardContent}>
                <Text style={s.cardTitle}>Molí Trabajos</Text>
                <Text style={s.cardDescription}>
                  Contratá profesionales o{'\n'}ofrecé tus servicios
                </Text>
              </View>
              <View style={[s.cardArrow, { backgroundColor: 'rgba(0,122,255,0.08)' }]}>
                <Ionicons name="arrow-forward" size={22} color="#007AFF" />
              </View>
              <View style={[s.cardAccent, { backgroundColor: '#007AFF' }]} />
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Footer */}
        <Animated.View style={[s.footer, footerStyle]}>
          <View style={s.footerDivider} />
          <Text style={s.footerText}>
            Molí • Move Libre
          </Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 40,
    alignItems: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  logoText: {
    fontSize: 38,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 6,
  },
  logoDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#6BBF00',
    marginLeft: 4,
    marginTop: -16,
  },
  greeting: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  cardsContainer: {
    gap: 16,
  },
  cardWrapper: {},
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    padding: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardViajes: {},
  cardTrabajos: {},
  cardIconContainer: {
    marginRight: 16,
  },
  cardIconBg: {
    width: 68,
    height: 68,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    lineHeight: 18,
    fontWeight: '500',
  },
  cardArrow: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  cardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  footer: {
    alignItems: 'center',
    marginTop: 48,
  },
  footerDivider: {
    width: 40,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    marginBottom: 16,
  },
  footerText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.25)',
    fontWeight: '600',
    letterSpacing: 1,
  },
});
