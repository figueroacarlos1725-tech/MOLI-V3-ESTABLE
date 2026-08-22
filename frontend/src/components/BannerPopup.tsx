import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
  Animated,
  Platform,
  Linking,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/src/services/api';
import { MOLI_COLORS, MOLI_RADIUS, MOLI_SHADOWS, MOLI_SPACING } from '@/src/theme/colors';

const { width: SCREEN_W } = Dimensions.get('window');

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
}

interface BannerPopupProps {
  target: 'rider' | 'driver';
  enabled: boolean;
  intervalMs?: number;
}

export default function BannerPopup({ target, enabled, intervalMs = 60000 }: BannerPopupProps) {
  const [banner, setBanner] = useState<Banner | null>(null);
  const [visible, setVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(300)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Fetch first banner after a short delay
    const initialTimer = setTimeout(() => fetchAndShow(), 5000);

    // Then fetch periodically
    timerRef.current = setInterval(fetchAndShow, intervalMs);

    return () => {
      clearTimeout(initialTimer);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, target]);

  const fetchAndShow = async () => {
    try {
      const res = await apiService.get(`/banners?target=${target}`);
      if (res.banners && res.banners.length > 0) {
        const randomBanner = res.banners[Math.floor(Math.random() * res.banners.length)];
        setBanner(randomBanner);
        setVisible(true);
        slideAnim.setValue(300);
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 60,
          friction: 12,
        }).start();
      }
    } catch (e) { /* silent */ }
  };

  const dismiss = () => {
    Animated.timing(slideAnim, {
      toValue: 400,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setVisible(false);
      setBanner(null);
    });
  };

  const handleLink = () => {
    if (banner?.button_link) {
      Linking.openURL(banner.button_link).catch(() => {});
    }
    dismiss();
  };

  if (!visible || !banner) return null;

  const bannerType = banner.banner_type || '';
  const hasImage = bannerType.includes('image') && banner.image_url;
  const hasVideo = bannerType.includes('video') && banner.video_url;
  const hasText = banner.title || banner.description;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={dismiss} activeOpacity={1} />
        <Animated.View style={[styles.card, { transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.handle} />
          {/* Close button */}
          <TouchableOpacity style={styles.closeBtn} onPress={dismiss}>
            <Ionicons name="close" size={22} color="#8E8E93" />
          </TouchableOpacity>

          {/* Sponsored tag */}
          <View style={styles.sponsoredTag}>
            <Ionicons name="megaphone" size={12} color="#FF7733" />
            <Text style={styles.sponsoredText}>Patrocinado</Text>
          </View>

          {/* Image */}
          {hasImage && (
            <Image
              source={{ uri: banner.image_url! }}
              style={styles.bannerImage}
              resizeMode="cover"
            />
          )}

          {/* Video placeholder (show as image with play icon for now) */}
          {hasVideo && !hasImage && (
            <View style={styles.videoPlaceholder}>
              <Ionicons name="play-circle" size={48} color="#fff" />
              <Text style={styles.videoText}>Video</Text>
            </View>
          )}

          {/* Text content */}
          {hasText && (
            <View style={styles.textContent}>
              {banner.title && <Text style={styles.bannerTitle}>{banner.title}</Text>}
              {banner.description && <Text style={styles.bannerDesc}>{banner.description}</Text>}
            </View>
          )}

          {/* CTA Button */}
          {banner.button_text && banner.button_link && (
            <TouchableOpacity style={styles.ctaBtn} onPress={handleLink}>
              <Text style={styles.ctaBtnText}>{banner.button_text}</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: MOLI_COLORS.overlay,
  },
  backdrop: {
    flex: 1,
  },
  card: {
    backgroundColor: MOLI_COLORS.white,
    borderTopLeftRadius: MOLI_RADIUS.xl,
    borderTopRightRadius: MOLI_RADIUS.xl,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    maxHeight: '70%',
  },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: MOLI_COLORS.lightGray, alignSelf: 'center', marginTop: 10 },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: MOLI_COLORS.offWhite,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  sponsoredTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: MOLI_SPACING.lg,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sponsoredText: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bannerImage: {
    width: SCREEN_W,
    height: 200,
    borderRadius: 0,
  },
  videoPlaceholder: {
    width: SCREEN_W,
    height: 200,
    backgroundColor: MOLI_COLORS.darkGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoText: {
    color: '#fff',
    fontSize: 13,
    marginTop: 4,
  },
  textContent: {
    paddingHorizontal: MOLI_SPACING.lg,
    paddingVertical: MOLI_SPACING.md,
  },
  bannerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: MOLI_COLORS.black,
    marginBottom: 8,
  },
  bannerDesc: {
    fontSize: 15,
    color: MOLI_COLORS.gray,
    lineHeight: 22,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: MOLI_COLORS.black,
    marginHorizontal: MOLI_SPACING.lg,
    paddingVertical: 16,
    borderRadius: MOLI_RADIUS.md,
    gap: 8,
    ...MOLI_SHADOWS.sm,
  },
  ctaBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
