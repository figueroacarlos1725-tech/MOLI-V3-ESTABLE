import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Platform,
  Switch,
  Image,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiService } from '@/src/services/api';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

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

const BANNER_TYPES = [
  { value: 'image_text', label: 'Imagen + Texto', icon: 'image' as const },
  { value: 'image_only', label: 'Solo Imagen', icon: 'image-outline' as const },
  { value: 'text_only', label: 'Solo Texto', icon: 'text' as const },
  { value: 'video_text', label: 'Video + Texto', icon: 'videocam' as const },
  { value: 'video_only', label: 'Solo Video', icon: 'videocam-outline' as const },
];

const TARGETS = [
  { value: 'both', label: 'Todos' },
  { value: 'rider', label: 'Pasajeros' },
  { value: 'driver', label: 'Conductores' },
];

export default function BannersAdmin() {
  const router = useRouter();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [msg, setMsg] = useState('');

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bannerType, setBannerType] = useState('image_text');
  const [imageUri, setImageUri] = useState('');
  const [videoUri, setVideoUri] = useState('');
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
      setMsg('Error cargando banners: ' + (e.message || ''));
    }
    setLoading(false);
  };

  const resetForm = () => {
    setTitle(''); setDescription(''); setBannerType('image_text');
    setImageUri(''); setVideoUri(''); setButtonText('');
    setButtonLink(''); setTarget('both'); setActive(true);
    setEditingBanner(null); setMsg('');
  };

  const openCreate = () => { resetForm(); setShowForm(true); };

  const openEdit = (b: Banner) => {
    setEditingBanner(b);
    setTitle(b.title || ''); setDescription(b.description || '');
    setBannerType(b.banner_type); setImageUri(b.image_url || '');
    setVideoUri(b.video_url || ''); setButtonText(b.button_text || '');
    setButtonLink(b.button_link || ''); setTarget(b.target);
    setActive(b.active);
    setShowForm(true);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.base64) {
        const ext = asset.uri.split('.').pop() || 'jpg';
        setImageUri(`data:image/${ext};base64,${asset.base64}`);
      }
    }
  };

  const pickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 0.5,
      base64: false,
    });
    if (!result.canceled && result.assets[0]) {
      setVideoUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setMsg('');
    try {
      const params = new URLSearchParams();
      if (title) params.append('title', title);
      if (description) params.append('description', description);
      params.append('banner_type', bannerType);
      if (imageUri) params.append('image_url', imageUri);
      if (videoUri) params.append('video_url', videoUri);
      if (buttonText) params.append('button_text', buttonText);
      if (buttonLink) params.append('button_link', buttonLink);
      params.append('target', target);
      params.append('active', String(active));

      const url = editingBanner
        ? `/admin/banners/${editingBanner.banner_id}?${params.toString()}`
        : `/admin/banners?${params.toString()}`;

      if (editingBanner) {
        await apiService.put(url);
      } else {
        await apiService.post(url);
      }
      setShowForm(false);
      resetForm();
      loadBanners();
      setMsg(editingBanner ? 'Banner actualizado' : 'Banner creado');
    } catch (e: any) {
      setMsg('Error: ' + (e.message || 'No se pudo guardar'));
    }
    setSaving(false);
  };

  const handleDelete = async (bannerId: string) => {
    try {
      await apiService.delete(`/admin/banners/${bannerId}`);
      loadBanners();
    } catch (e: any) {
      setMsg('Error eliminando: ' + (e.message || ''));
    }
  };

  const handleToggleActive = async (b: Banner) => {
    try {
      await apiService.put(`/admin/banners/${b.banner_id}?active=${!b.active}`);
      loadBanners();
    } catch (e) { /* silent */ }
  };

  return (
    <SafeAreaView style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Banners Publicitarios</Text>
        <TouchableOpacity style={st.addBtn} onPress={openCreate}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {msg ? (
        <View style={st.msgBar}>
          <Text style={st.msgText}>{msg}</Text>
          <TouchableOpacity onPress={() => setMsg('')}><Ionicons name="close" size={16} color="#636366" /></TouchableOpacity>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator size="large" color="#6BBF00" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={st.list} contentContainerStyle={{ paddingBottom: 40 }}>
          {banners.length === 0 && (
            <View style={st.empty}>
              <Ionicons name="megaphone-outline" size={48} color="#C7C7CC" />
              <Text style={st.emptyTitle}>Sin banners</Text>
              <Text style={st.emptySub}>Toca + para crear el primero</Text>
            </View>
          )}
          {banners.map(b => (
            <View key={b.banner_id} style={[st.card, !b.active && { opacity: 0.5 }]}>
              <View style={st.cardTop}>
                <View style={st.typeTag}>
                  <Text style={st.typeTagText}>{BANNER_TYPES.find(t => t.value === b.banner_type)?.label}</Text>
                </View>
                <Text style={st.targetText}>{TARGETS.find(t => t.value === b.target)?.label}</Text>
              </View>
              {b.image_url && <Image source={{ uri: b.image_url }} style={st.cardImg} resizeMode="cover" />}
              {b.title && <Text style={st.cardTitle}>{b.title}</Text>}
              {b.description && <Text style={st.cardDesc} numberOfLines={2}>{b.description}</Text>}
              {b.button_text && (
                <View style={st.ctaPreview}><Text style={st.ctaPreviewText}>{b.button_text}</Text></View>
              )}
              <View style={st.cardActions}>
                <TouchableOpacity onPress={() => handleToggleActive(b)} style={st.actBtn}>
                  <Ionicons name={b.active ? 'eye' : 'eye-off'} size={16} color={b.active ? '#6BBF00' : '#999'} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openEdit(b)} style={st.actBtn}>
                  <Ionicons name="create" size={16} color="#007AFF" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(b.banner_id)} style={st.actBtn}>
                  <Ionicons name="trash" size={16} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Form Modal */}
      <Modal visible={showForm} animationType="slide" onRequestClose={() => setShowForm(false)}>
        <SafeAreaView style={st.formSafe}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <View style={st.formHeader}>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Ionicons name="close" size={24} color="#1C1C1E" />
              </TouchableOpacity>
              <Text style={st.formTitle}>{editingBanner ? 'Editar Banner' : 'Nuevo Banner'}</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#6BBF00" /> : (
                  <Text style={st.formSaveText}>Guardar</Text>
                )}
              </TouchableOpacity>
            </View>

            <ScrollView style={st.form} contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
              {/* Type selector */}
              <Text style={st.label}>Tipo</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {BANNER_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.value}
                    style={[st.chip, bannerType === t.value && st.chipActive]}
                    onPress={() => setBannerType(t.value)}
                  >
                    <Ionicons name={t.icon} size={16} color={bannerType === t.value ? '#fff' : '#636366'} />
                    <Text style={[st.chipText, bannerType === t.value && st.chipTextActive]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Target */}
              <Text style={st.label}>Audiencia</Text>
              <View style={st.targetRow}>
                {TARGETS.map(t => (
                  <TouchableOpacity
                    key={t.value}
                    style={[st.targetChip, target === t.value && st.targetChipActive]}
                    onPress={() => setTarget(t.value)}
                  >
                    <Text style={[st.targetChipText, target === t.value && { color: '#fff' }]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Image upload */}
              {bannerType.includes('image') && (
                <View style={st.uploadSection}>
                  <Text style={st.label}>Imagen</Text>
                  <TouchableOpacity style={st.uploadBtn} onPress={pickImage}>
                    {imageUri ? (
                      <Image source={{ uri: imageUri }} style={st.uploadPreview} resizeMode="cover" />
                    ) : (
                      <View style={st.uploadPlaceholder}>
                        <Ionicons name="cloud-upload" size={32} color="#C7C7CC" />
                        <Text style={st.uploadText}>Tocar para subir imagen</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  {imageUri ? (
                    <TouchableOpacity onPress={() => setImageUri('')} style={st.removeMedia}>
                      <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                      <Text style={{ color: '#FF3B30', fontSize: 13 }}>Quitar imagen</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}

              {/* Video upload */}
              {bannerType.includes('video') && (
                <View style={st.uploadSection}>
                  <Text style={st.label}>Video</Text>
                  <TouchableOpacity style={st.uploadBtn} onPress={pickVideo}>
                    {videoUri ? (
                      <View style={[st.uploadPlaceholder, { backgroundColor: '#1C1C1E' }]}>
                        <Ionicons name="videocam" size={32} color="#6BBF00" />
                        <Text style={{ color: '#fff', fontSize: 13, marginTop: 4 }}>Video seleccionado</Text>
                      </View>
                    ) : (
                      <View style={st.uploadPlaceholder}>
                        <Ionicons name="videocam-outline" size={32} color="#C7C7CC" />
                        <Text style={st.uploadText}>Tocar para subir video</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  {videoUri ? (
                    <TouchableOpacity onPress={() => setVideoUri('')} style={st.removeMedia}>
                      <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                      <Text style={{ color: '#FF3B30', fontSize: 13 }}>Quitar video</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}

              {/* Title & Description */}
              {!bannerType.endsWith('_only') && (
                <>
                  <Text style={st.label}>Título</Text>
                  <TextInput style={st.input} value={title} onChangeText={setTitle} placeholder="Ej: Lubricentro Express" placeholderTextColor="#C7C7CC" />
                  <Text style={st.label}>Descripción</Text>
                  <TextInput style={[st.input, { height: 80, textAlignVertical: 'top' }]} value={description} onChangeText={setDescription} placeholder="Texto del anuncio..." placeholderTextColor="#C7C7CC" multiline />
                </>
              )}

              {/* CTA Button */}
              <Text style={st.label}>Botón de acción (opcional)</Text>
              <TextInput style={st.input} value={buttonText} onChangeText={setButtonText} placeholder="Texto (ej: Ver ofertas)" placeholderTextColor="#C7C7CC" />
              <TextInput style={st.input} value={buttonLink} onChangeText={setButtonLink} placeholder="Link (https://...)" placeholderTextColor="#C7C7CC" autoCapitalize="none" />

              {/* Active */}
              <View style={st.switchRow}>
                <Text style={st.label}>Activo</Text>
                <Switch value={active} onValueChange={setActive} trackColor={{ false: '#E5E5EA', true: '#6BBF00' }} />
              </View>
            </ScrollView>

            {/* Bottom save button (always visible) */}
            <View style={st.bottomBar}>
              <TouchableOpacity style={st.bottomSaveBtn} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : (
                  <Text style={st.bottomSaveText}>{editingBanner ? 'Guardar cambios' : 'Crear banner'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#6BBF00', justifyContent: 'center', alignItems: 'center' },
  msgBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E3F2FD', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  msgText: { flex: 1, fontSize: 13, color: '#1C1C1E' },
  list: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginTop: 12 },
  emptySub: { fontSize: 14, color: '#8E8E93', marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 12, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 6 },
  typeTag: { backgroundColor: '#F0FFF0', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  typeTagText: { fontSize: 11, fontWeight: '600', color: '#6BBF00' },
  targetText: { fontSize: 11, fontWeight: '600', color: '#8E8E93' },
  cardImg: { width: '100%', height: 120 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1C1C1E', paddingHorizontal: 12, paddingTop: 8 },
  cardDesc: { fontSize: 13, color: '#636366', paddingHorizontal: 12, paddingTop: 2 },
  ctaPreview: { marginHorizontal: 12, marginTop: 8, backgroundColor: '#6BBF00', borderRadius: 8, paddingVertical: 6, alignItems: 'center' },
  ctaPreviewText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 4, padding: 10 },
  actBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' },
  // Form
  formSafe: { flex: 1, backgroundColor: '#fff' },
  formHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  formTitle: { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  formSaveText: { fontSize: 16, fontWeight: '700', color: '#6BBF00' },
  form: { flex: 1, paddingHorizontal: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#636366', marginTop: 16, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#F2F2F7', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1C1C1E', marginBottom: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F2F2F7', marginRight: 8 },
  chipActive: { backgroundColor: '#6BBF00' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#636366' },
  chipTextActive: { color: '#fff' },
  targetRow: { flexDirection: 'row', gap: 8 },
  targetChip: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F2F2F7', alignItems: 'center' },
  targetChipActive: { backgroundColor: '#6BBF00' },
  targetChipText: { fontSize: 14, fontWeight: '600', color: '#636366' },
  uploadSection: { marginTop: 4 },
  uploadBtn: { borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: '#E5E5EA', borderStyle: 'dashed' },
  uploadPlaceholder: { height: 140, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F8FA' },
  uploadText: { fontSize: 14, color: '#8E8E93', marginTop: 8 },
  uploadPreview: { width: '100%', height: 180 },
  removeMedia: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  bottomBar: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#E5E5EA', backgroundColor: '#fff' },
  bottomSaveBtn: { backgroundColor: '#6BBF00', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  bottomSaveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
