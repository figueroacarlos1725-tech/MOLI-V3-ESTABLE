import React from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Image, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';

const { width } = Dimensions.get('window');

export default function ModulesScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const isDriver = user?.user_type === 'driver';

  const handleViajes = () => {
    if (isDriver) {
      router.replace('/(driver)/home');
    } else {
      router.replace('/(rider)/home');
    }
  };

  const handleTrabajos = () => {
    router.push('/(jobs)/home');
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.content}>
        {/* Logo */}
        <View style={s.logoSection}>
          <Image
            source={require('../assets/icon.png')}
            style={s.logo}
            resizeMode="contain"
          />
          <Text style={s.greeting}>Hola, {user?.name?.split(' ')[0] || 'Usuario'}</Text>
          <Text style={s.subtitle}>¿Qué querés hacer hoy?</Text>
        </View>

        {/* Module Cards */}
        <View style={s.cards}>
          {/* Moli Viajes */}
          <TouchableOpacity style={s.card} onPress={handleViajes} activeOpacity={0.85}>
            <View style={[s.cardIcon, { backgroundColor: 'rgba(0,200,83,0.1)' }]}>
              <Ionicons name="car-sport" size={36} color="#00C853" />
            </View>
            <Text style={s.cardTitle}>Moli Viajes</Text>
            <Text style={s.cardDesc}>
              {isDriver ? 'Conectate y empezá a ganar con viajes' : 'Pedí un auto o moto en minutos'}
            </Text>
            <View style={s.cardArrow}>
              <Ionicons name="arrow-forward" size={20} color="#00C853" />
            </View>
          </TouchableOpacity>

          {/* Moli Trabajos */}
          <TouchableOpacity style={s.card} onPress={handleTrabajos} activeOpacity={0.85}>
            <View style={[s.cardIcon, { backgroundColor: 'rgba(0,122,255,0.1)' }]}>
              <Ionicons name="briefcase" size={36} color="#007AFF" />
            </View>
            <Text style={s.cardTitle}>Moli Trabajos</Text>
            <Text style={s.cardDesc}>
              {isDriver ? 'Ofrecé tus servicios profesionales' : 'Encontrá profesionales cerca tuyo'}
            </Text>
            <View style={[s.cardArrow, { backgroundColor: 'rgba(0,122,255,0.1)' }]}>
              <Ionicons name="arrow-forward" size={20} color="#007AFF" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity style={s.logoutBtn} onPress={() => {
          router.replace('/(auth)/welcome');
        }}>
          <Ionicons name="log-out-outline" size={18} color="#8E8E93" />
          <Text style={s.logoutText}>Cambiar cuenta</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { flex: 1, paddingHorizontal: 28, justifyContent: 'center' },
  logoSection: { alignItems: 'center', marginBottom: 40 },
  logo: { width: 80, height: 80, borderRadius: 20, marginBottom: 16 },
  greeting: { fontSize: 24, fontWeight: '800', color: '#1C1C1E' },
  subtitle: { fontSize: 15, color: '#8E8E93', marginTop: 4 },
  cards: { gap: 14 },
  card: {
    backgroundColor: '#F8F8FA',
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  cardIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#1C1C1E', marginLeft: 14 },
  cardDesc: { fontSize: 12, color: '#8E8E93', marginLeft: 14, flex: 1, marginTop: 2 },
  cardArrow: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(0,200,83,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 32,
    paddingVertical: 12,
  },
  logoutText: { fontSize: 14, color: '#8E8E93' },
});
