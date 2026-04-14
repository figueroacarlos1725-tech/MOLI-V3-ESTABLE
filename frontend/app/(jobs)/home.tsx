import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
  Image,
  Animated as RNAnimated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import JobsMapView, { JobMarker } from '@/src/components/JobsMapView';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

// ─── Job categories ─────────────────────
const JOB_CATEGORIES: Record<string, { emoji: string; label: string; color: string }> = {
  pintura: { emoji: '🎨', label: 'Pintura', color: '#FF9500' },
  plomeria: { emoji: '🔧', label: 'Plomería', color: '#007AFF' },
  electricidad: { emoji: '⚡', label: 'Electricidad', color: '#FFCC00' },
  limpieza: { emoji: '🧹', label: 'Limpieza', color: '#34C759' },
  construccion: { emoji: '🏗️', label: 'Construcción', color: '#AF5232' },
  mudanzas: { emoji: '📦', label: 'Mudanzas', color: '#5856D6' },
  carpinteria: { emoji: '🔨', label: 'Carpintería', color: '#A2845E' },
  jardineria: { emoji: '🌿', label: 'Jardinería', color: '#00C853' },
};

// ─── Mock jobs data (Catamarca area) ────
const MOCK_JOBS: (JobMarker & {
  description: string;
  budget: number;
  clientName: string;
  clientRating: number;
  postedAgo: string;
  images: string[];
  interestedCount: number;
  address: string;
  distance: string;
})[] = [
  {
    id: 'job_001',
    latitude: -28.4650,
    longitude: -65.7780,
    category: 'pintura',
    title: 'Pintar habitación 4x4',
    emoji: '🎨',
    budget: 25000,
    description: 'Necesito pintar una habitación de 4x4 metros, paredes y techo. Color blanco. Tengo la pintura, solo necesito mano de obra.',
    clientName: 'María García',
    clientRating: 4.8,
    postedAgo: 'Hace 12 min',
    images: [],
    interestedCount: 2,
    address: 'Av. Güemes 450, Catamarca',
    distance: '1.2 km',
  },
  {
    id: 'job_002',
    latitude: -28.4730,
    longitude: -65.7900,
    category: 'plomeria',
    title: 'Arreglar canilla que pierde',
    emoji: '🔧',
    budget: 8000,
    description: 'Canilla de la cocina que pierde agua constantemente. Creo que hay que cambiar el cuerito o la canilla completa.',
    clientName: 'Carlos López',
    clientRating: 4.5,
    postedAgo: 'Hace 25 min',
    images: [],
    interestedCount: 1,
    address: 'San Martín 780, Catamarca',
    distance: '0.8 km',
  },
  {
    id: 'job_003',
    latitude: -28.4600,
    longitude: -65.7850,
    category: 'electricidad',
    title: 'Instalar 4 luces LED',
    emoji: '⚡',
    budget: 15000,
    description: 'Necesito instalar 4 plafones LED en el living y comedor. Ya tengo las luces compradas, falta instalación y cableado.',
    clientName: 'Ana Rodríguez',
    clientRating: 4.9,
    postedAgo: 'Hace 5 min',
    images: [],
    interestedCount: 0,
    address: 'Rivadavia 320, Catamarca',
    distance: '1.5 km',
  },
  {
    id: 'job_004',
    latitude: -28.4750,
    longitude: -65.7800,
    category: 'limpieza',
    title: 'Limpieza profunda departamento',
    emoji: '🧹',
    budget: 12000,
    description: 'Departamento de 2 ambientes, necesita limpieza profunda completa incluyendo cocina y baño. Para entrega de alquiler.',
    clientName: 'Pedro Sánchez',
    clientRating: 4.7,
    postedAgo: 'Hace 40 min',
    images: [],
    interestedCount: 3,
    address: 'Republica 155, Catamarca',
    distance: '0.5 km',
  },
  {
    id: 'job_005',
    latitude: -28.4680,
    longitude: -65.7950,
    category: 'construccion',
    title: 'Levantar pared de ladrillos',
    emoji: '🏗️',
    budget: 45000,
    description: 'Necesito levantar una pared divisoria de 3m x 2.5m en ladrillo hueco. Incluye materiales y mano de obra.',
    clientName: 'Roberto Díaz',
    clientRating: 4.6,
    postedAgo: 'Hace 1 hora',
    images: [],
    interestedCount: 1,
    address: 'Esquiú 890, Catamarca',
    distance: '2.1 km',
  },
  {
    id: 'job_006',
    latitude: -28.4710,
    longitude: -65.7750,
    category: 'carpinteria',
    title: 'Armar mueble de cocina',
    emoji: '🔨',
    budget: 18000,
    description: 'Compré un mueble bajo mesada y necesito que lo armen e instalen. Son 3 módulos.',
    clientName: 'Laura Martínez',
    clientRating: 5.0,
    postedAgo: 'Hace 15 min',
    images: [],
    interestedCount: 0,
    address: 'Mota Botello 234, Catamarca',
    distance: '1.0 km',
  },
  {
    id: 'job_007',
    latitude: -28.4620,
    longitude: -65.7880,
    category: 'jardineria',
    title: 'Podar árboles y limpiar jardín',
    emoji: '🌿',
    budget: 20000,
    description: 'Jardín de 100m². Necesito poda de 2 árboles grandes, corte de pasto y limpieza general.',
    clientName: 'Silvia Romero',
    clientRating: 4.3,
    postedAgo: 'Hace 30 min',
    images: [],
    interestedCount: 2,
    address: 'Chacabuco 567, Catamarca',
    distance: '1.8 km',
  },
  {
    id: 'job_008',
    latitude: -28.4770,
    longitude: -65.7830,
    category: 'mudanzas',
    title: 'Mudanza departamento chico',
    emoji: '📦',
    budget: 30000,
    description: 'Mudanza de monoambiente. Heladera, lavarropas, cama, escritorio y 10 cajas. Distancia 5 km.',
    clientName: 'Diego Fernández',
    clientRating: 4.4,
    postedAgo: 'Hace 2 horas',
    images: [],
    interestedCount: 4,
    address: 'Salta 123, Catamarca',
    distance: '0.3 km',
  },
];

export default function JobsHomeScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [isOnline, setIsOnline] = useState(false);
  const [selectedJob, setSelectedJob] = useState<typeof MOCK_JOBS[0] | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  // Bottom sheet animation
  const sheetTranslateY = useSharedValue(500);
  const overlayOpacity = useSharedValue(0);

  const openSheet = (job: typeof MOCK_JOBS[0]) => {
    setSelectedJob(job);
    setShowSheet(true);
    overlayOpacity.value = withTiming(1, { duration: 200 });
    sheetTranslateY.value = withSpring(0, { damping: 20, stiffness: 150 });
  };

  const closeSheet = () => {
    overlayOpacity.value = withTiming(0, { duration: 200 });
    sheetTranslateY.value = withTiming(500, { duration: 250 }, () => {
      runOnJS(setShowSheet)(false);
      runOnJS(setSelectedJob)(null);
    });
  };

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const handleJobPress = (jobId: string) => {
    const job = MOCK_JOBS.find(j => j.id === jobId);
    if (job) openSheet(job);
  };

  // Filter jobs by category
  const filteredJobs = activeFilter
    ? MOCK_JOBS.filter(j => j.category === activeFilter)
    : MOCK_JOBS;

  const formatBudget = (n: number) => {
    return '$' + n.toLocaleString('es-AR');
  };

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.replace('/modules')}
        >
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>

        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Moli Trabajos</Text>
          <Text style={s.headerSubtitle}>
            {filteredJobs.length} trabajos disponibles
          </Text>
        </View>

        <TouchableOpacity
          style={[s.onlineToggle, isOnline && s.onlineToggleActive]}
          onPress={() => setIsOnline(!isOnline)}
        >
          <View style={[s.onlineDot, isOnline && s.onlineDotActive]} />
          <Text style={[s.onlineText, isOnline && s.onlineTextActive]}>
            {isOnline ? 'En línea' : 'Offline'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Category filters */}
      <View style={s.filtersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtersScroll}>
          <TouchableOpacity
            style={[s.filterChip, !activeFilter && s.filterChipActive]}
            onPress={() => setActiveFilter(null)}
          >
            <Text style={[s.filterText, !activeFilter && s.filterTextActive]}>Todos</Text>
          </TouchableOpacity>
          {Object.entries(JOB_CATEGORIES).map(([key, cat]) => (
            <TouchableOpacity
              key={key}
              style={[
                s.filterChip,
                activeFilter === key && { backgroundColor: cat.color + '22', borderColor: cat.color },
              ]}
              onPress={() => setActiveFilter(activeFilter === key ? null : key)}
            >
              <Text style={s.filterEmoji}>{cat.emoji}</Text>
              <Text style={[
                s.filterText,
                activeFilter === key && { color: cat.color },
              ]}>{cat.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Map */}
      <View style={s.mapContainer}>
        <JobsMapView
          initialRegion={{ latitude: -28.4696, longitude: -65.7852 }}
          jobs={filteredJobs}
          onJobPress={handleJobPress}
        />

        {/* Online status overlay */}
        {!isOnline && (
          <View style={s.offlineOverlay}>
            <View style={s.offlineBanner}>
              <Ionicons name="eye-off-outline" size={18} color="#FF9500" />
              <Text style={s.offlineText}>Estás offline — los clientes no te ven</Text>
            </View>
          </View>
        )}
      </View>

      {/* Bottom Sheet */}
      {showSheet && selectedJob && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Animated.View style={[s.overlay, overlayStyle]}>
            <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeSheet} activeOpacity={1} />
          </Animated.View>

          <Animated.View style={[s.sheet, sheetStyle]}>
            {/* Handle */}
            <View style={s.sheetHandle}>
              <View style={s.handleBar} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={s.sheetScroll}>
              {/* Category badge + posted time */}
              <View style={s.sheetTopRow}>
                <View style={[s.categoryBadge, { backgroundColor: JOB_CATEGORIES[selectedJob.category]?.color + '20' }]}>
                  <Text style={s.categoryEmoji}>{selectedJob.emoji}</Text>
                  <Text style={[s.categoryLabel, { color: JOB_CATEGORIES[selectedJob.category]?.color }]}>
                    {JOB_CATEGORIES[selectedJob.category]?.label}
                  </Text>
                </View>
                <Text style={s.postedAgo}>{selectedJob.postedAgo}</Text>
              </View>

              {/* Title */}
              <Text style={s.jobTitle}>{selectedJob.title}</Text>

              {/* Budget */}
              <View style={s.budgetRow}>
                <Text style={s.budgetLabel}>Presupuesto ofrecido</Text>
                <Text style={s.budgetValue}>{formatBudget(selectedJob.budget)}</Text>
              </View>

              {/* Description */}
              <Text style={s.jobDescription}>{selectedJob.description}</Text>

              {/* Info pills */}
              <View style={s.infoPills}>
                <View style={s.pill}>
                  <Ionicons name="location-outline" size={14} color="#00C853" />
                  <Text style={s.pillText}>{selectedJob.distance}</Text>
                </View>
                <View style={s.pill}>
                  <Ionicons name="navigate-outline" size={14} color="#007AFF" />
                  <Text style={s.pillText}>Dirección visible al aceptar</Text>
                </View>
                {selectedJob.interestedCount > 0 && (
                  <View style={[s.pill, { borderColor: 'rgba(255,149,0,0.3)' }]}>
                    <Ionicons name="people-outline" size={14} color="#FF9500" />
                    <Text style={[s.pillText, { color: '#FF9500' }]}>
                      {selectedJob.interestedCount} interesados
                    </Text>
                  </View>
                )}
              </View>

              {/* Client info */}
              <View style={s.clientCard}>
                <View style={s.clientAvatar}>
                  <Ionicons name="person" size={22} color="rgba(255,255,255,0.6)" />
                </View>
                <View style={s.clientInfo}>
                  <Text style={s.clientName}>{selectedJob.clientName}</Text>
                  <View style={s.clientRatingRow}>
                    <Ionicons name="star" size={13} color="#FFCC00" />
                    <Text style={s.clientRating}>{selectedJob.clientRating}</Text>
                  </View>
                </View>
                <TouchableOpacity style={s.chatBtn}>
                  <Ionicons name="chatbubble-outline" size={18} color="#007AFF" />
                </TouchableOpacity>
              </View>

              {/* Actions */}
              <View style={s.sheetActions}>
                <TouchableOpacity style={s.rejectBtn} onPress={closeSheet}>
                  <Ionicons name="close" size={20} color="#FF3B30" />
                  <Text style={s.rejectText}>Rechazar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.acceptBtn} onPress={closeSheet}>
                  <Ionicons name="checkmark" size={20} color="#000" />
                  <Text style={s.acceptText}>Aceptar trabajo</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    backgroundColor: '#fff',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
  },
  onlineToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  onlineToggleActive: {
    backgroundColor: 'rgba(123,45,142,0.1)',
    borderColor: 'rgba(123,45,142,0.3)',
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C7C7CC',
  },
  onlineDotActive: {
    backgroundColor: '#7B2D8E',
  },
  onlineText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E8E93',
  },
  onlineTextActive: {
    color: '#7B2D8E',
  },
  // Filters
  filtersContainer: {
    paddingVertical: 4,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  filtersScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  filterChipActive: {
    backgroundColor: 'rgba(123,45,142,0.1)',
    borderColor: 'rgba(123,45,142,0.3)',
  },
  filterEmoji: {
    fontSize: 14,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
  },
  filterTextActive: {
    color: '#7B2D8E',
  },
  // Map
  mapContainer: {
    flex: 1,
    marginTop: 4,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  offlineOverlay: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 10,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.3)',
  },
  offlineText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF9500',
  },
  // Overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  // Bottom Sheet
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: height * 0.7,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#E5E5EA',
  },
  sheetHandle: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C7C7CC',
  },
  sheetScroll: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  // Sheet content
  sheetTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  categoryEmoji: {
    fontSize: 16,
  },
  categoryLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  postedAgo: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
  },
  jobTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,200,83,0.08)',
    padding: 14,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,200,83,0.15)',
  },
  budgetLabel: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '500',
  },
  budgetValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#00C853',
  },
  jobDescription: {
    fontSize: 14,
    color: '#636366',
    lineHeight: 21,
    marginBottom: 14,
  },
  infoPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  pillText: {
    fontSize: 12,
    color: '#636366',
    fontWeight: '500',
  },
  // Client
  clientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    padding: 12,
    borderRadius: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  clientAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 2,
  },
  clientRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clientRating: {
    fontSize: 13,
    color: '#FFCC00',
    fontWeight: '600',
  },
  chatBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(0,122,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Actions
  sheetActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: Platform.OS === 'ios' ? 30 : 16,
  },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,59,48,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.2)',
  },
  rejectText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FF3B30',
  },
  acceptBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: '#00C853',
  },
  acceptText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000',
  },
});
