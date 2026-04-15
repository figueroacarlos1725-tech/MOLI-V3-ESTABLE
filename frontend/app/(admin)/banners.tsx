import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, TextInput, ActivityIndicator, Switch, Image, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiService } from '@/src/services/api';
import * as ImagePicker from 'expo-image-picker';

const GREEN = '#00C853';

interface Banner {
  banner_id: string;
  title: string | null;
  description: string | null;
  banner_type: string;
  image_url: string | null;
  video_url: string | null;
  button_text: string | null;
  button_link: string | null;
  target: string;
  active: boolean;
}

export default function BannersScreen() {
  const router = useRouter();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState('');
  const [buttonText, setButtonText] = useState('');
  const [buttonLink, setButtonLink] = useState('');
  const [target, setTarget] = useState('both');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadBanners(); }, []);

  const loadBanners = async () => {
    setLoading(true);
    try {
      const res = await apiService.get('/admin/banners');
      setBanners(res.banners || []);
    } catch (e: any) {
      setMsg('Error: ' + (e.message || ''));
    }
    setLoading(false);
  };

  const resetForm = () => {
    setTitle(''); setDescription(''); setImageUri('');
    setButtonText(''); setButtonLink(''); setTarget('both');
    setActive(true); setEditingBanner(null); setMsg('');
  };

  const openEdit = (b: Banner) => {
    setEditingBanner(b);
    setTitle(b.title || ''); setDescription(b.description || '');
    setImageUri(b.image_url || ''); setButtonText(b.button_text || '');
    setButtonLink(b.button_link || ''); setTarget(b.target);
    setActive(b.active);
    setShowForm(true);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.3, // Low quality to keep base64 small
      base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      setImageUri(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    if (!title.trim()) { setMsg('Error: El título es obligatorio'); return; }
    setSaving(true);
    setMsg('');
    try {
      let imgUrl = imageUri;
      if (imgUrl && imgUrl.startsWith('data:') && imgUrl.length > 500000) {
        setMsg('Error: Imagen muy grande. Usá una más pequeña o pegá URL.');
        setSaving(false);
        return;
      }

      const payload: any = {
        title: title.trim(),
        description: description.trim() || null,
        banner_type: imgUrl ? 'image_text' : 'text_only',
        image_url: imgUrl || null,
        button_text: buttonText.trim() || null,
        button_link: buttonLink.trim() || null,
        target,
        active,
      };

      if (editingBanner) {
        await apiService.put(`/admin/banners/${editingBanner.banner_id}`, payload);
        setMsg('Banner actualizado ✓');
      } else {
        await apiService.post('/admin/banners', payload);
        setMsg('Banner creado ✓');
      }
      setShowForm(false);
      resetForm();
      loadBanners();
    } catch (e: any) {
      setMsg('Error: ' + (e.message || 'No se pudo guardar'));
    }
    setSaving(false);
  };

  const handleDelete = (bannerId: string) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('¿Seguro que querés eliminar este banner?');
      if (confirmed) {
        doDelete(bannerId);
      }
    } else {
      Alert.alert('Eliminar banner', '¿Seguro?', [
        { text: 'No', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => doDelete(bannerId) },
      ]);
    }
  };

  const doDelete = async (bannerId: string) => {
    try {
      await apiService.delete(`/admin/banners/${bannerId}`);
      setMsg('Banner eliminado ✓');
      loadBanners();
    } catch (e: any) { setMsg('Error: ' + e.message); }
  };

  const toggleActive = async (b: Banner) => {
    try {
      await apiService.put(`/admin/banners/${b.banner_id}`, { active: !b.active });
      loadBanners();
    } catch {}
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}><ActivityIndicator size="large" color={GREEN} /></View>
      </SafeAreaView>
    );
  }

  // ═══ FORM VIEW ═══
  if (showForm) {
    return (
      <SafeAreaView style={s.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => { setShowForm(false); resetForm(); }} style={s.backBtn}>
              <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
            </TouchableOpacity>
            <Text style={s.headerTitle}>{editingBanner ? 'Editar Banner' : 'Nuevo Banner'}</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {msg ? <Text style={{ color: msg.includes('Error') ? '#FF3B30' : GREEN, textAlign: 'center', marginBottom: 8, fontWeight: '600' }}>{msg}</Text> : null}

            <Text style={s.label}>Título *</Text>
            <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="Ej: 50% de descuento" placeholderTextColor="#8E8E93" />

            <Text style={s.label}>Descripción</Text>
            <TextInput style={[s.input, { height: 60 }]} value={description} onChangeText={setDescription} placeholder="Texto del banner" placeholderTextColor="#8E8E93" multiline />

            <Text style={s.label}>Imagen</Text>
            {imageUri ? (
              <View style={{ marginBottom: 12 }}>
                <Image source={{ uri: imageUri }} style={{ width: '100%', height: 150, borderRadius: 12 }} resizeMode="cover" />
                <TouchableOpacity style={{ position: 'absolute', top: 8, right: 8, backgroundColor: '#FF3B30', borderRadius: 12, padding: 4 }} onPress={() => setImageUri('')}>
                  <Ionicons name="close" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              <TouchableOpacity style={s.imgBtn} onPress={pickImage}>
                <Ionicons name="camera" size={18} color={GREEN} />
                <Text style={s.imgBtnText}>Galería</Text>
              </TouchableOpacity>
              <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} value={imageUri.startsWith('data:') ? '' : imageUri} onChangeText={setImageUri} placeholder="O pegar URL de imagen" placeholderTextColor="#8E8E93" />
            </View>

            <Text style={s.label}>Botón (opcional)</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} value={buttonText} onChangeText={setButtonText} placeholder="Texto del botón" placeholderTextColor="#8E8E93" />
              <TextInput style={[s.input, { flex: 1, marginBottom: 0 }]} value={buttonLink} onChangeText={setButtonLink} placeholder="URL del botón" placeholderTextColor="#8E8E93" />
            </View>

            <Text style={s.label}>Destino</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {['both', 'rider', 'driver'].map(t => (
                <TouchableOpacity key={t} style={[s.chip, target === t && s.chipActive]} onPress={() => setTarget(t)}>
                  <Text style={[s.chipText, target === t && { color: '#fff' }]}>
                    {t === 'both' ? 'Todos' : t === 'rider' ? 'Pasajeros' : 'Conductores'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#1C1C1E' }}>Activo</Text>
              <Switch value={active} onValueChange={setActive} trackColor={{ true: GREEN }} />
            </View>

            <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={s.saveBtnText}>{editingBanner ? 'Guardar cambios' : 'Crear banner'}</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ═══ LIST VIEW ═══
  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Banners Publicitarios</Text>
      </View>

      {msg ? <Text style={{ color: msg.includes('Error') ? '#FF3B30' : GREEN, textAlign: 'center', padding: 8, fontWeight: '600' }}>{msg}</Text> : null}

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {banners.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Ionicons name="megaphone-outline" size={48} color="#D1D1D6" />
            <Text style={{ color: '#8E8E93', marginTop: 8, fontSize: 15 }}>No hay banners</Text>
          </View>
        )}
        {banners.map(b => (
          <View key={b.banner_id} style={s.card}>
            {b.image_url ? (
              <Image source={{ uri: b.image_url }} style={s.cardImage} resizeMode="cover" />
            ) : null}
            <View style={s.cardBody}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={s.cardTitle} numberOfLines={1}>{b.title || 'Sin título'}</Text>
                <View style={[s.activeBadge, { backgroundColor: b.active ? '#E8F5E9' : '#FFEBEE' }]}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: b.active ? GREEN : '#FF3B30' }}>{b.active ? 'Activo' : 'Inactivo'}</Text>
                </View>
              </View>
              {b.description ? <Text style={s.cardDesc} numberOfLines={2}>{b.description}</Text> : null}
              <Text style={s.cardTarget}>
                {b.target === 'both' ? 'Todos' : b.target === 'rider' ? 'Pasajeros' : 'Conductores'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TouchableOpacity style={s.actionBtn} onPress={() => toggleActive(b)}>
                  <Ionicons name={b.active ? 'eye-off' : 'eye'} size={16} color="#636366" />
                </TouchableOpacity>
                <TouchableOpacity style={s.actionBtn} onPress={() => openEdit(b)}>
                  <Ionicons name="pencil" size={16} color="#007AFF" />
                </TouchableOpacity>
                <TouchableOpacity style={s.actionBtn} onPress={() => handleDelete(b.banner_id)}>
                  <Ionicons name="trash" size={16} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* FAB - Create new */}
      <TouchableOpacity style={s.fab} onPress={() => { resetForm(); setShowForm(true); }}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E5E5EA', gap: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', flex: 1 },
  card: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 12, overflow: 'hidden' },
  cardImage: { width: '100%', height: 120 },
  cardBody: { padding: 14 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E', flex: 1, marginRight: 8 },
  cardDesc: { fontSize: 13, color: '#636366', marginTop: 4 },
  cardTarget: { fontSize: 11, color: '#8E8E93', marginTop: 4 },
  activeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  actionBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: GREEN, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#8E8E93', marginBottom: 4, marginTop: 10 },
  input: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1C1C1E', borderWidth: 1, borderColor: '#E5E5EA', marginBottom: 4 },
  imgBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: GREEN },
  imgBtnText: { color: GREEN, fontWeight: '600', fontSize: 14 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E5EA' },
  chipActive: { backgroundColor: GREEN, borderColor: GREEN },
  chipText: { fontSize: 13, fontWeight: '600', color: '#636366' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 18, marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
