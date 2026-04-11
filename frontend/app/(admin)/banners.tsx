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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { apiService } from '@/src/services/api';

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
  { value: 'image_text', label: 'Imagen + Texto', icon: 'image' },
  { value: 'image_only', label: 'Solo Imagen', icon: 'image-outline' },
  { value: 'text_only', label: 'Solo Texto', icon: 'text' },
  { value: 'video_text', label: 'Video + Texto', icon: 'videocam' },
  { value: 'video_only', label: 'Solo Video', icon: 'videocam-outline' },
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

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bannerType, setBannerType] = useState('image_text');
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
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
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const resetForm = () => {
    setTitle(''); setDescription(''); setBannerType('image_text');
    setImageUrl(''); setVideoUrl(''); setButtonText('');
    setButtonLink(''); setTarget('both'); setActive(true);
    setEditingBanner(null);
  };

  const openCreate = () => { resetForm(); setShowForm(true); };

  const openEdit = (b: Banner) => {
    setEditingBanner(b);
    setTitle(b.title || ''); setDescription(b.description || '');
    setBannerType(b.banner_type); setImageUrl(b.image_url || '');
    setVideoUrl(b.video_url || ''); setButtonText(b.button_text || '');
    setButtonLink(b.button_link || ''); setTarget(b.target);
    setActive(b.active);
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const params = new URLSearchParams();
      if (title) params.append('title', title);
      if (description) params.append('description', description);
      params.append('banner_type', bannerType);
      if (imageUrl) params.append('image_url', imageUrl);
      if (videoUrl) params.append('video_url', videoUrl);
      if (buttonText) params.append('button_text', buttonText);
      if (buttonLink) params.append('button_link', buttonLink);
      params.append('target', target);
      params.append('active', String(active));

      if (editingBanner) {
        await apiService.put(`/admin/banners/${editingBanner.banner_id}?${params.toString()}`);
      } else {
        await apiService.post(`/admin/banners?${params.toString()}`);
      }
      setShowForm(false);
      resetForm();
      loadBanners();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleDelete = async (bannerId: string) => {
    try {
      await apiService.delete(`/admin/banners/${bannerId}`);
      loadBanners();
    } catch (e) { console.error(e); }
  };

  const handleToggleActive = async (b: Banner) => {
    try {
      await apiService.put(`/admin/banners/${b.banner_id}?active=${!b.active}`);
      loadBanners();
    } catch (e) { console.error(e); }
  };

  const getTypeIcon = (type: string) => {
    const t = BANNER_TYPES.find(bt => bt.value === type);
    return t?.icon || 'help-circle';
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Banners Publicitarios</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#6BBF00" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 40 }}>
          {banners.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="megaphone-outline" size={48} color="#C7C7CC" />
              <Text style={styles.emptyText}>No hay banners creados</Text>
              <Text style={styles.emptySubtext}>Crea tu primer banner publicitario</Text>
            </View>
          )}
          {banners.map(b => (
            <View key={b.banner_id} style={[styles.bannerCard, !b.active && styles.bannerInactive]}>
              <View style={styles.bannerTop}>
                <View style={styles.bannerTypeTag}>
                  <Ionicons name={getTypeIcon(b.banner_type) as any} size={14} color="#6BBF00" />
                  <Text style={styles.bannerTypeText}>{BANNER_TYPES.find(t => t.value === b.banner_type)?.label}</Text>
                </View>
                <View style={[styles.targetTag, b.target === 'driver' ? { backgroundColor: '#E3F2FD' } : b.target === 'rider' ? { backgroundColor: '#FFF3E0' } : {}]}>
                  <Text style={styles.targetText}>
                    {TARGETS.find(t => t.value === b.target)?.label}
                  </Text>
                </View>
              </View>

              {b.image_url && (
                <Image source={{ uri: b.image_url }} style={styles.bannerPreview} resizeMode="cover" />
              )}

              {b.title && <Text style={styles.bannerTitle}>{b.title}</Text>}
              {b.description && <Text style={styles.bannerDesc} numberOfLines={2}>{b.description}</Text>}
              
              {b.button_text && (
                <View style={styles.btnPreview}>
                  <Text style={styles.btnPreviewText}>{b.button_text}</Text>
                </View>
              )}

              <View style={styles.bannerActions}>
                <TouchableOpacity onPress={() => handleToggleActive(b)} style={styles.actionBtn}>
                  <Ionicons name={b.active ? 'eye' : 'eye-off'} size={18} color={b.active ? '#6BBF00' : '#8E8E93'} />
                  <Text style={[styles.actionText, !b.active && { color: '#8E8E93' }]}>
                    {b.active ? 'Activo' : 'Inactivo'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openEdit(b)} style={styles.actionBtn}>
                  <Ionicons name="create" size={18} color="#007AFF" />
                  <Text style={[styles.actionText, { color: '#007AFF' }]}>Editar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(b.banner_id)} style={styles.actionBtn}>
                  <Ionicons name="trash" size={18} color="#FF3B30" />
                  <Text style={[styles.actionText, { color: '#FF3B30' }]}>Eliminar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Create/Edit Form Modal */}
      <Modal visible={showForm} animationType="slide" onRequestClose={() => setShowForm(false)}>
        <SafeAreaView style={styles.formContainer}>
          <View style={styles.formHeader}>
            <TouchableOpacity onPress={() => setShowForm(false)}>
              <Ionicons name="close" size={24} color="#1C1C1E" />
            </TouchableOpacity>
            <Text style={styles.formTitle}>{editingBanner ? 'Editar Banner' : 'Nuevo Banner'}</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.form} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Banner Type */}
            <Text style={styles.label}>Tipo de banner</Text>
            <View style={styles.typeGrid}>
              {BANNER_TYPES.map(t => (
                <TouchableOpacity
                  key={t.value}
                  style={[styles.typeOption, bannerType === t.value && styles.typeSelected]}
                  onPress={() => setBannerType(t.value)}
                >
                  <Ionicons name={t.icon as any} size={20} color={bannerType === t.value ? '#6BBF00' : '#8E8E93'} />
                  <Text style={[styles.typeLabel, bannerType === t.value && { color: '#6BBF00' }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Target */}
            <Text style={styles.label}>Audiencia</Text>
            <View style={styles.targetGrid}>
              {TARGETS.map(t => (
                <TouchableOpacity
                  key={t.value}
                  style={[styles.targetOption, target === t.value && styles.targetSelected]}
                  onPress={() => setTarget(t.value)}
                >
                  <Text style={[styles.targetOptText, target === t.value && { color: '#fff' }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Title */}
            {bannerType !== 'image_only' && bannerType !== 'video_only' && (
              <>
                <Text style={styles.label}>Título</Text>
                <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Título del banner" />
                <Text style={styles.label}>Descripción</Text>
                <TextInput style={[styles.input, { height: 80 }]} value={description} onChangeText={setDescription} placeholder="Texto descriptivo" multiline />
              </>
            )}

            {/* Image URL */}
            {bannerType.includes('image') && (
              <>
                <Text style={styles.label}>URL de imagen</Text>
                <TextInput style={styles.input} value={imageUrl} onChangeText={setImageUrl} placeholder="https://..." autoCapitalize="none" />
                {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.imagePreview} resizeMode="cover" /> : null}
              </>
            )}

            {/* Video URL */}
            {bannerType.includes('video') && (
              <>
                <Text style={styles.label}>URL de video</Text>
                <TextInput style={styles.input} value={videoUrl} onChangeText={setVideoUrl} placeholder="https://..." autoCapitalize="none" />
              </>
            )}

            {/* CTA Button */}
            <Text style={styles.label}>Botón (opcional)</Text>
            <TextInput style={styles.input} value={buttonText} onChangeText={setButtonText} placeholder="Texto del botón (ej: Ver más)" />
            <TextInput style={styles.input} value={buttonLink} onChangeText={setButtonLink} placeholder="URL del botón (https://...)" autoCapitalize="none" />

            {/* Active toggle */}
            <View style={styles.switchRow}>
              <Text style={styles.label}>Activo</Text>
              <Switch value={active} onValueChange={setActive} trackColor={{ false: '#E5E5EA', true: '#6BBF00' }} />
            </View>

            {/* Save */}
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.saveBtnText}>{editingBanner ? 'Guardar cambios' : 'Crear banner'}</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#6BBF00', justifyContent: 'center', alignItems: 'center' },
  list: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginTop: 12 },
  emptySubtext: { fontSize: 14, color: '#8E8E93', marginTop: 4 },
  bannerCard: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 16, overflow: 'hidden' },
  bannerInactive: { opacity: 0.6 },
  bannerTop: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8 },
  bannerTypeTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F0FFF0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  bannerTypeText: { fontSize: 11, fontWeight: '600', color: '#6BBF00' },
  targetTag: { backgroundColor: '#F2F2F7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  targetText: { fontSize: 11, fontWeight: '600', color: '#636366' },
  bannerPreview: { width: '100%', height: 120 },
  bannerTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E', paddingHorizontal: 14, paddingTop: 10 },
  bannerDesc: { fontSize: 13, color: '#636366', paddingHorizontal: 14, paddingTop: 4 },
  btnPreview: { marginHorizontal: 14, marginTop: 10, backgroundColor: '#6BBF00', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  btnPreviewText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  bannerActions: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F2F2F7', marginTop: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 13, fontWeight: '600', color: '#6BBF00' },
  // Form
  formContainer: { flex: 1, backgroundColor: '#fff' },
  formHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  formTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  form: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#1C1C1E', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: '#F2F2F7', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1C1C1E', marginBottom: 4 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeOption: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F2F2F7', borderWidth: 2, borderColor: 'transparent' },
  typeSelected: { borderColor: '#6BBF00', backgroundColor: '#F0FFF0' },
  typeLabel: { fontSize: 12, fontWeight: '600', color: '#8E8E93' },
  targetGrid: { flexDirection: 'row', gap: 8 },
  targetOption: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F2F2F7', alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  targetSelected: { backgroundColor: '#6BBF00', borderColor: '#6BBF00' },
  targetOptText: { fontSize: 14, fontWeight: '600', color: '#636366' },
  imagePreview: { width: '100%', height: 150, borderRadius: 12, marginTop: 8 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  saveBtn: { backgroundColor: '#6BBF00', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
