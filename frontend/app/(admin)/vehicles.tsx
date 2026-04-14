import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { apiService } from '@/src/services/api';

interface VehicleIcon {
  vehicle_type: string;
  display_name: string;
  icon_type: 'emoji' | 'image';
  emoji_value: string | null;
  image_data: string | null;
  updated_at?: string;
}

const EMOJI_OPTIONS = [
  '🚗', '🚕', '🚙', '🏎️', '🚐', '🚌', '🛻', '🚑',
  '🚓', '🚒', '🏍️', '🛵', '🚲', '🚎', '🚜', '🚚',
];

const VEHICLE_TYPE_ICONS: Record<string, string> = {
  economy: 'car-outline',
  comfort: 'car',
  premium: 'car-sport',
  xl: 'bus',
};

export default function AdminVehicleIconsScreen() {
  const [icons, setIcons] = useState<VehicleIcon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingType, setSavingType] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  useEffect(() => {
    fetchIcons();
  }, []);

  const fetchIcons = async () => {
    try {
      const response = await apiService.get('/admin/vehicle-icons');
      setIcons(response.icons || []);
    } catch (error) {
      console.error('Error obteniendo iconos:', error);
      Alert.alert('Error', 'No se pudieron cargar los iconos de vehículos');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectEmoji = async (vehicleType: string, emoji: string) => {
    setSavingType(vehicleType);
    try {
      await apiService.put(`/admin/vehicle-icons/${vehicleType}`, {
        icon_type: 'emoji',
        emoji_value: emoji,
      });
      await fetchIcons();
      setEditingType(null);
      setShowEmojiPicker(false);
      Alert.alert('Listo', 'Icono actualizado correctamente');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo actualizar el icono');
    } finally {
      setSavingType(null);
    }
  };

  const handleUploadImage = async (vehicleType: string) => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permiso requerido', 'Se necesita acceso a la galería para subir imágenes');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]?.base64) return;

      const base64Data = result.assets[0].base64;
      
      // Check size (~500KB limit)
      if (base64Data.length > 700000) {
        Alert.alert('Imagen muy grande', 'La imagen debe ser menor a 500KB. Intentá con una imagen más pequeña o de menor resolución.');
        return;
      }

      setSavingType(vehicleType);
      
      await apiService.put(`/admin/vehicle-icons/${vehicleType}`, {
        icon_type: 'image',
        image_data: `data:image/png;base64,${base64Data}`,
      });

      await fetchIcons();
      setEditingType(null);
      Alert.alert('Listo', 'Imagen del vehículo actualizada');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo subir la imagen');
    } finally {
      setSavingType(null);
    }
  };

  const handleResetToEmoji = async (vehicleType: string) => {
    const defaults: Record<string, string> = {
      economy: '🚗',
      comfort: '🚙',
      premium: '🏎️',
      xl: '🚐',
    };
    await handleSelectEmoji(vehicleType, defaults[vehicleType] || '🚗');
  };

  const renderIconPreview = (icon: VehicleIcon, size: number = 48) => {
    if (icon.icon_type === 'image' && icon.image_data) {
      return (
        <Image
          source={{ uri: icon.image_data }}
          style={{ width: size, height: size, borderRadius: 8 }}
          resizeMode="contain"
        />
      );
    }
    return (
      <Text style={{ fontSize: size * 0.7, textAlign: 'center' }}>
        {icon.emoji_value || '🚗'}
      </Text>
    );
  };

  const renderMapPreview = (icon: VehicleIcon) => {
    return (
      <View style={styles.mapPreview}>
        <View style={styles.mapPreviewBg}>
          <View style={styles.mapGrid}>
            {[...Array(6)].map((_, i) => (
              <View key={i} style={styles.mapGridLine} />
            ))}
          </View>
          <View style={styles.mapPreviewMarker}>
            {renderIconPreview(icon, 36)}
          </View>
        </View>
        <Text style={styles.mapPreviewLabel}>Vista previa en mapa</Text>
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8E44AD" />
          <Text style={styles.loadingText}>Cargando iconos...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Iconos de Vehículos</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color="#8E44AD" />
          <Text style={styles.infoText}>
            Personalizá los iconos que se muestran en el mapa para cada tipo de servicio. Podés usar emojis o subir imágenes PNG.
          </Text>
        </View>

        <View style={styles.sizeInfo}>
          <Ionicons name="resize" size={16} color="#8E8E93" />
          <Text style={styles.sizeInfoText}>
            Tamaño recomendado: 80x80px a 200x200px (PNG). Se auto-ajustan en el mapa a ~40x40px.
          </Text>
        </View>

        {icons.map((icon) => (
          <View key={icon.vehicle_type} style={styles.iconCard}>
            <View style={styles.iconCardHeader}>
              <View style={styles.iconCardTitleRow}>
                <Ionicons
                  name={VEHICLE_TYPE_ICONS[icon.vehicle_type] as any || 'car'}
                  size={24}
                  color="#8E44AD"
                />
                <Text style={styles.iconCardTitle}>{icon.display_name}</Text>
                <View style={[styles.typeBadge, icon.icon_type === 'image' ? styles.typeBadgeImage : styles.typeBadgeEmoji]}>
                  <Text style={styles.typeBadgeText}>
                    {icon.icon_type === 'image' ? 'PNG' : 'Emoji'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.iconCardBody}>
              <View style={styles.currentIconSection}>
                <Text style={styles.sectionLabel}>Icono actual</Text>
                <View style={styles.currentIconBox}>
                  {renderIconPreview(icon, 56)}
                </View>
              </View>

              {renderMapPreview(icon)}
            </View>

            {editingType === icon.vehicle_type ? (
              <View style={styles.editSection}>
                {showEmojiPicker && (
                  <View style={styles.emojiPickerSection}>
                    <Text style={styles.sectionLabel}>Elegir emoji</Text>
                    <View style={styles.emojiGrid}>
                      {EMOJI_OPTIONS.map((emoji) => (
                        <TouchableOpacity
                          key={emoji}
                          style={[
                            styles.emojiOption,
                            icon.emoji_value === emoji && icon.icon_type === 'emoji' && styles.emojiOptionSelected,
                          ]}
                          onPress={() => handleSelectEmoji(icon.vehicle_type, emoji)}
                          disabled={savingType === icon.vehicle_type}
                        >
                          <Text style={styles.emojiOptionText}>{emoji}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                <View style={styles.editButtons}>
                  <TouchableOpacity
                    style={[styles.editBtn, styles.emojiBtnStyle]}
                    onPress={() => setShowEmojiPicker(!showEmojiPicker)}
                  >
                    <Text style={styles.editBtnEmoji}>😀</Text>
                    <Text style={styles.editBtnText}>Elegir Emoji</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.editBtn, styles.uploadBtnStyle]}
                    onPress={() => handleUploadImage(icon.vehicle_type)}
                    disabled={savingType === icon.vehicle_type}
                  >
                    <Ionicons name="cloud-upload" size={20} color="#fff" />
                    <Text style={[styles.editBtnText, { color: '#fff' }]}>Subir PNG</Text>
                  </TouchableOpacity>
                </View>

                {icon.icon_type === 'image' && (
                  <TouchableOpacity
                    style={styles.resetBtn}
                    onPress={() => handleResetToEmoji(icon.vehicle_type)}
                  >
                    <Ionicons name="refresh" size={16} color="#FF3B30" />
                    <Text style={styles.resetBtnText}>Volver a emoji predeterminado</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.cancelEditBtn}
                  onPress={() => { setEditingType(null); setShowEmojiPicker(false); }}
                >
                  <Text style={styles.cancelEditBtnText}>Cerrar</Text>
                </TouchableOpacity>

                {savingType === icon.vehicle_type && (
                  <View style={styles.savingOverlay}>
                    <ActivityIndicator size="small" color="#8E44AD" />
                    <Text style={styles.savingText}>Guardando...</Text>
                  </View>
                )}
              </View>
            ) : (
              <TouchableOpacity
                style={styles.editIconBtn}
                onPress={() => { setEditingType(icon.vehicle_type); setShowEmojiPicker(false); }}
              >
                <Ionicons name="pencil" size={18} color="#8E44AD" />
                <Text style={styles.editIconBtnText}>Cambiar icono</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  scrollContent: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#8E8E93',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#F3E8FF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    alignItems: 'flex-start',
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#6B21A8',
    lineHeight: 18,
  },
  sizeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    marginBottom: 16,
  },
  sizeInfoText: {
    fontSize: 12,
    color: '#8E8E93',
    flex: 1,
  },
  iconCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  iconCardHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  iconCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    flex: 1,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  typeBadgeEmoji: {
    backgroundColor: '#FFF3E0',
  },
  typeBadgeImage: {
    backgroundColor: '#E8F5E9',
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  iconCardBody: {
    flexDirection: 'row',
    padding: 16,
    gap: 16,
  },
  currentIconSection: {
    flex: 1,
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  currentIconBox: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: '#F9FAFB',
    borderWidth: 2,
    borderColor: '#E5E5EA',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapPreview: {
    flex: 2,
    alignItems: 'center',
  },
  mapPreviewBg: {
    width: '100%',
    height: 72,
    backgroundColor: '#E8F0E8',
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  mapGrid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-around',
  },
  mapGridLine: {
    height: 1,
    backgroundColor: 'rgba(0,200,83,0.15)',
  },
  mapPreviewMarker: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 20,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  mapPreviewLabel: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 6,
  },
  editSection: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
    backgroundColor: '#FAFAFA',
  },
  emojiPickerSection: {
    marginBottom: 16,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emojiOption: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiOptionSelected: {
    backgroundColor: '#E8D5F5',
    borderWidth: 2,
    borderColor: '#8E44AD',
  },
  emojiOptionText: {
    fontSize: 24,
  },
  editButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  emojiBtnStyle: {
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  uploadBtnStyle: {
    backgroundColor: '#8E44AD',
  },
  editBtnEmoji: {
    fontSize: 18,
  },
  editBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginBottom: 8,
  },
  resetBtnText: {
    fontSize: 13,
    color: '#FF3B30',
  },
  cancelEditBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  cancelEditBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
  },
  savingOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  savingText: {
    fontSize: 14,
    color: '#8E44AD',
  },
  editIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
  },
  editIconBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E44AD',
  },
});
