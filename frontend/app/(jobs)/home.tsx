import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/src/services/api';
import { useAuthStore } from '@/src/stores/authStore';

export default function JobsHomeScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [tab, setTab] = useState<'browse' | 'my-offers'>('browse');
  const [jobs, setJobs] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [catsRes, jobsRes, profileRes, offersRes] = await Promise.all([
        apiService.get('/jobs/categories'),
        apiService.get('/jobs/posts?status=open'),
        apiService.get('/jobs/professional/profile'),
        apiService.get('/jobs/my-offers'),
      ]);
      setCategories(catsRes.categories || []);
      setJobs(jobsRes.jobs || []);
      setHasProfile(profileRes.has_profile);
      setOffers(offersRes.offers || []);
    } catch (e) { console.log('Jobs load error', e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const filteredJobs = selectedCat ? jobs.filter(j => j.category === selectedCat) : jobs;

  const getCatIcon = (catId: string) => {
    const cat = categories.find(c => c.category_id === catId || c.id === catId);
    return cat?.icon || 'briefcase';
  };
  const getCatColor = (catId: string) => {
    const cat = categories.find(c => c.category_id === catId || c.id === catId);
    return cat?.color || '#8E8E93';
  };
  const getCatName = (catId: string) => {
    const cat = categories.find(c => c.category_id === catId || c.id === catId);
    return cat?.name || catId;
  };

  if (loading) return (
    <SafeAreaView style={s.container}>
      <View style={s.center}><ActivityIndicator size="large" color="#00C853" /></View>
    </SafeAreaView>
  );

  // Prompt to setup professional profile
  if (!hasProfile) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Moli Trabajos</Text>
        </View>
        <View style={s.center}>
          <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: 'rgba(0,200,83,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
            <Ionicons name="briefcase" size={40} color="#00C853" />
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#1C1C1E', textAlign: 'center' }}>Configurá tu perfil profesional</Text>
          <Text style={{ fontSize: 15, color: '#8E8E93', textAlign: 'center', marginTop: 8, paddingHorizontal: 40, lineHeight: 22 }}>
            Completá tu perfil para poder ofrecer tus servicios y recibir trabajos en Moli.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: '#00C853', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 14, marginTop: 28 }}
            onPress={() => router.push('/(jobs)/setup-profile')}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Completar perfil</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Moli Trabajos</Text>
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        <TouchableOpacity style={[s.tab, tab === 'browse' && s.tabActive]} onPress={() => setTab('browse')}>
          <Text style={[s.tabText, tab === 'browse' && s.tabTextActive]}>Trabajos disponibles</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, tab === 'my-offers' && s.tabActive]} onPress={() => setTab('my-offers')}>
          <Text style={[s.tabText, tab === 'my-offers' && s.tabTextActive]}>Mis ofertas ({offers.length})</Text>
        </TouchableOpacity>
      </View>

      {tab === 'browse' ? (
        <>
          {/* Category filter */}
          <FlatList
            horizontal
            data={[{ category_id: null, name: 'Todos', icon: 'apps', color: '#1C1C1E' }, ...categories]}
            keyExtractor={(item) => item.category_id || 'all'}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[s.catChip, selectedCat === item.category_id && { backgroundColor: '#00C853' }]}
                onPress={() => setSelectedCat(item.category_id)}
              >
                <Ionicons name={item.icon as any} size={16} color={selectedCat === item.category_id ? '#fff' : item.color || '#8E8E93'} />
                <Text style={[s.catChipText, selectedCat === item.category_id && { color: '#fff' }]}>{item.name}</Text>
              </TouchableOpacity>
            )}
          />

          {/* Job list */}
          <FlatList
            data={filteredJobs}
            keyExtractor={(item) => item.job_id}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 40 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} tintColor="#00C853" />}
            ListEmptyComponent={<Text style={s.emptyText}>No hay trabajos disponibles en esta categoría</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={s.jobCard}
                onPress={() => router.push({ pathname: '/(jobs)/job-detail', params: { jobId: item.job_id } })}
              >
                <View style={s.jobHeader}>
                  <View style={[s.jobCatIcon, { backgroundColor: getCatColor(item.category) + '20' }]}>
                    <Ionicons name={getCatIcon(item.category) as any} size={20} color={getCatColor(item.category)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.jobTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={s.jobCat}>{getCatName(item.category)}</Text>
                  </View>
                  <Text style={s.jobBudget}>${item.budget?.toLocaleString()}</Text>
                </View>
                <Text style={s.jobDesc} numberOfLines={2}>{item.description}</Text>
                <View style={s.jobFooter}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="location-outline" size={14} color="#8E8E93" />
                    <Text style={s.jobMeta} numberOfLines={1}>{item.address || 'Sin dirección'}</Text>
                  </View>
                  <Text style={s.jobOffers}>{item.offers_count || 0} ofertas</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </>
      ) : (
        <FlatList
          data={offers}
          keyExtractor={(item) => item.offer_id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          ListEmptyComponent={<Text style={s.emptyText}>No enviaste ofertas todavía</Text>}
          renderItem={({ item }) => (
            <View style={[s.jobCard, item.status === 'accepted' && { borderLeftWidth: 3, borderLeftColor: '#00C853' }]}>
              <Text style={s.jobTitle}>{item.job_title || 'Trabajo'}</Text>
              <Text style={s.jobDesc}>Tu oferta: ${item.price?.toLocaleString()}</Text>
              <View style={[s.statusChip, { backgroundColor: item.status === 'accepted' ? '#E8F5E9' : item.status === 'rejected' ? '#FFEBEE' : '#FFF3E0' }]}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: item.status === 'accepted' ? '#00C853' : item.status === 'rejected' ? '#FF3B30' : '#FF9500' }}>
                  {item.status === 'accepted' ? 'Aceptada' : item.status === 'rejected' ? 'Rechazada' : 'Pendiente'}
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginLeft: 12 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#00C853' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#8E8E93' },
  tabTextActive: { color: '#00C853' },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F2F2F7' },
  catChipText: { fontSize: 13, fontWeight: '600', color: '#1C1C1E' },
  jobCard: { backgroundColor: '#F8F8FA', borderRadius: 16, padding: 16 },
  jobHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  jobCatIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  jobTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  jobCat: { fontSize: 12, color: '#8E8E93', marginTop: 1 },
  jobBudget: { fontSize: 18, fontWeight: '800', color: '#00C853' },
  jobDesc: { fontSize: 13, color: '#636366', lineHeight: 18, marginBottom: 10 },
  jobFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  jobMeta: { fontSize: 12, color: '#8E8E93', maxWidth: 200 },
  jobOffers: { fontSize: 12, fontWeight: '600', color: '#007AFF' },
  emptyText: { textAlign: 'center', color: '#8E8E93', marginTop: 40, fontSize: 15 },
  statusChip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 8 },
});
