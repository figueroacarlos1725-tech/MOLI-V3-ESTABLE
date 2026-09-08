import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  ScrollView, Alert, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/components/Button';
import { apiService } from '@/src/services/api';
import { useAuthStore } from '@/src/stores/authStore';

const CATEGORY_OPTIONS = [
  { id: 'electricista', name: 'Electricista', icon: 'flash' },
  { id: 'plomero', name: 'Plomero', icon: 'water' },
  { id: 'limpieza', name: 'Limpieza', icon: 'sparkles' },
  { id: 'mudanza', name: 'Mudanza', icon: 'cube' },
  { id: 'pintura', name: 'Pintura', icon: 'color-palette' },
  { id: 'jardineria', name: 'Jardinería', icon: 'leaf' },
  { id: 'carpinteria', name: 'Carpintería', icon: 'hammer' },
  { id: 'mecanica', name: 'Mecánica', icon: 'construct' },
  { id: 'tecnologia', name: 'Tecnología', icon: 'laptop' },
  { id: 'otro', name: 'Otro', icon: 'ellipsis-horizontal' },
];

export default function SetupProfileScreen() {
  const router = useRouter();
  const updateUser = useAuthStore(state => state.updateUser);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Load existing profile if any
    apiService.get('/jobs/professional/profile').then(r => {
      if (r.profile) {
        setSelectedCats(r.profile.categories || []);
        setDescription(r.profile.description || '');
        setHourlyRate(String(r.profile.hourly_rate || ''));
      }
    }).catch(() => {});
  }, []);

  const toggleCat = (id: string) => {
    setSelectedCats(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const handleSave = async () => {
    if (selectedCats.length === 0) { Alert.alert('Error', 'Seleccioná al menos una categoría'); return; }
    if (!description.trim()) { Alert.alert('Error', 'Agregá una descripción de tus servicios'); return; }
    setSaving(true);
    try {
      await apiService.put('/jobs/professional/profile', {
        categories: selectedCats,
        description: description.trim(),
        hourly_rate: parseFloat(hourlyRate) || 0,
        is_available: true,
      });
      updateUser({ is_professional: true });
      Alert.alert('Perfil guardado', 'Ya podés recibir y ofertar trabajos');
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo guardar');
    } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
              <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Perfil profesional</Text>
          </View>

          <Text style={s.sectionTitle}>¿Qué servicios ofrecés?</Text>
          <Text style={s.sectionSubtitle}>Seleccioná todas las categorías en las que trabajás</Text>
          <View style={s.catGrid}>
            {CATEGORY_OPTIONS.map(cat => {
              const isSelected = selectedCats.includes(cat.id);
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[s.catOption, isSelected && s.catOptionSelected]}
                  onPress={() => toggleCat(cat.id)}
                >
                  <Ionicons name={cat.icon as any} size={24} color={isSelected ? '#FF7733' : '#8E8E93'} />
                  <Text style={[s.catOptionText, isSelected && s.catOptionTextSelected]}>{cat.name}</Text>
                  {isSelected && <Ionicons name="checkmark-circle" size={18} color="#FF7733" style={{ position: 'absolute', top: 8, right: 8 }} />}
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.sectionTitle}>Sobre vos</Text>
          <TextInput
            style={s.textArea}
            placeholder="Describí tu experiencia, herramientas, años de trabajo..."
            placeholderTextColor="#8E8E93"
            value={description}
            onChangeText={setDescription}
            multiline
            textAlignVertical="top"
          />

          <Text style={s.sectionTitle}>Tarifa por hora (opcional)</Text>
          <View style={s.rateRow}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#1C1C1E' }}>$</Text>
            <TextInput
              style={s.rateInput}
              placeholder="500"
              placeholderTextColor="#C7C7CC"
              value={hourlyRate}
              onChangeText={setHourlyRate}
              keyboardType="numeric"
            />
            <Text style={{ fontSize: 14, color: '#8E8E93' }}>/hora</Text>
          </View>

          <Button title="Guardar perfil" onPress={handleSave} loading={saving} size="large" style={{ marginTop: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginLeft: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E', paddingHorizontal: 20, marginTop: 24, marginBottom: 4 },
  sectionSubtitle: { fontSize: 13, color: '#8E8E93', paddingHorizontal: 20, marginBottom: 12 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10 },
  catOption: { width: '30%', aspectRatio: 1, backgroundColor: '#F8F8FA', borderRadius: 16, justifyContent: 'center', alignItems: 'center', gap: 6, borderWidth: 2, borderColor: 'transparent' },
  catOptionSelected: { borderColor: '#FF7733', backgroundColor: 'rgba(255,119,51,0.06)' },
  catOptionText: { fontSize: 11, fontWeight: '600', color: '#8E8E93', textAlign: 'center' },
  catOptionTextSelected: { color: '#FF7733' },
  textArea: { marginHorizontal: 20, backgroundColor: '#F2F2F7', borderRadius: 14, padding: 16, fontSize: 15, color: '#1C1C1E', minHeight: 100, marginTop: 8 },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginTop: 8, backgroundColor: '#F2F2F7', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
  rateInput: { fontSize: 24, fontWeight: '700', color: '#1C1C1E', flex: 1 },
});
