import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { apiService } from '@/src/services/api';

const APP_VERSION = Constants.expoConfig?.version || '1.0.0';

export default function ForceUpdateChecker() {
  const [updateRequired, setUpdateRequired] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    checkForUpdates();
  }, []);

  const checkForUpdates = async () => {
    try {
      // 1. Check backend for forced version
      const data = await apiService.get('/app/version-check', { params: { current_version: APP_VERSION } });
      if (data.force_update) {
        setUpdateRequired(true);
        setUpdateInfo(data);
        return;
      }

      // 2. Check for OTA updates via expo-updates
      if (!__DEV__) {
        try {
          const update = await Updates.checkForUpdateAsync();
          if (update.isAvailable) {
            setUpdateInfo({
              message: 'Hay una actualización disponible con mejoras y correcciones.',
              min_version: APP_VERSION,
            });
            // Auto-fetch the update
            await Updates.fetchUpdateAsync();
            // Suggest restart
            setUpdateRequired(true);
          }
        } catch (e) {
          // OTA check failed, not critical
          console.log('OTA check skipped:', e);
        }
      }
    } catch (e) {
      // Backend check failed, app continues normally
      console.log('Version check skipped:', e);
    }
  };

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      if (!__DEV__) {
        await Updates.reloadAsync();
      }
    } catch (e) {
      setIsUpdating(false);
    }
  };

  if (!updateRequired) return null;

  return (
    <Modal visible={true} transparent animationType="fade">
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.iconBg}>
            <Ionicons name="arrow-up-circle" size={48} color="#00C853" />
          </View>
          <Text style={s.title}>Actualización requerida</Text>
          <Text style={s.message}>
            {updateInfo?.message || 'Hay una nueva versión disponible con mejoras importantes.'}
          </Text>
          <Text style={s.version}>
            Tu versión: {APP_VERSION} → Mínima: {updateInfo?.min_version || 'nueva'}
          </Text>

          <TouchableOpacity
            style={s.updateBtn}
            onPress={handleUpdate}
            disabled={isUpdating}
            activeOpacity={0.8}
          >
            {isUpdating ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="download-outline" size={20} color="#fff" />
                <Text style={s.updateBtnText}>Actualizar ahora</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  card: {
    backgroundColor: '#1A1A2E',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,200,83,0.2)',
    width: '100%',
  },
  iconBg: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: 'rgba(0,200,83,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 10,
  },
  message: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
  },
  version: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    marginBottom: 24,
  },
  updateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: '#00C853',
  },
  updateBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
});
