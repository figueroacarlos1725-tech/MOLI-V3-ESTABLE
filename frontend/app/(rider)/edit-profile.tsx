import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  ScrollView, Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Input } from '@/src/components/Input';
import { Button } from '@/src/components/Button';
import { useAuthStore } from '@/src/stores/authStore';
import { apiService } from '@/src/services/api';

export default function EditProfileScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuthStore();
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Error', 'El nombre es requerido'); return; }
    setSaving(true);
    try {
      await apiService.put('/auth/profile', { name: name.trim(), phone: phone.trim() });
      if (refreshUser) await refreshUser();
      Alert.alert('Listo', 'Perfil actualizado');
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo actualizar');
    } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
            </TouchableOpacity>
            <Text style={styles.title}>Editar perfil</Text>
          </View>

          <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
            <Input label="Nombre" value={name} onChangeText={setName} leftIcon="person-outline" autoCapitalize="words" />
            <Input label="Teléfono" value={phone} onChangeText={setPhone} leftIcon="call-outline" keyboardType="phone-pad" />
            <Input label="Email" value={user?.email || ''} onChangeText={() => {}} leftIcon="mail-outline" disabled />

            <Button title="Guardar cambios" onPress={handleSave} loading={saving} size="large" style={{ marginTop: 16 }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginLeft: 12 },
});
