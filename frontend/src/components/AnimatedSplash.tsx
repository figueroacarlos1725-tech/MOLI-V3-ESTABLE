import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  withSpring,
  Easing,
  interpolate,
  type SharedValue,
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

interface AnimatedSplashProps {
  onFinish: () => void;
}

export default function AnimatedSplash({ onFinish }: AnimatedSplashProps) {
  // Animation values
  const logoScale = useSharedValue(0.3);
  const logoOpacity = useSharedValue(0);
  const letterSpacing = useSharedValue(40);
  const sloganOpacity = useSharedValue(0);
  const sloganTranslateY = useSharedValue(20);
  const dotScale = useSharedValue(0);
  const dotGlow = useSharedValue(0);
  const lineWidth = useSharedValue(0);
  const bgPulse = useSharedValue(0);
  const exitScale = useSharedValue(1);
  const exitOpacity = useSharedValue(1);

  // Particle effects
  const particle1 = useSharedValue(0);
  const particle2 = useSharedValue(0);
  const particle3 = useSharedValue(0);

  useEffect(() => {
    // Phase 1: Logo appears with spring bounce
    logoOpacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) });
    logoScale.value = withSpring(1, { damping: 12, stiffness: 100, mass: 0.8 });
    letterSpacing.value = withDelay(200, withTiming(8, { duration: 800, easing: Easing.out(Easing.exp) }));

    // Phase 2: Green dot pops in
    dotScale.value = withDelay(600, withSpring(1, { damping: 8, stiffness: 200 }));
    dotGlow.value = withDelay(700, withSequence(
      withTiming(1, { duration: 400 }),
      withTiming(0.5, { duration: 300 }),
      withTiming(1, { duration: 300 }),
    ));

    // Phase 3: Line extends
    lineWidth.value = withDelay(900, withTiming(1, { duration: 600, easing: Easing.inOut(Easing.cubic) }));

    // Phase 4: Slogan slides up
    sloganOpacity.value = withDelay(1200, withTiming(1, { duration: 500 }));
    sloganTranslateY.value = withDelay(1200, withSpring(0, { damping: 15, stiffness: 120 }));

    // Phase 5: Particles float
    particle1.value = withDelay(800, withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) }));
    particle2.value = withDelay(1000, withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) }));
    particle3.value = withDelay(1200, withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) }));

    // Phase 6: Background pulse
    bgPulse.value = withDelay(600, withSequence(
      withTiming(1, { duration: 600 }),
      withTiming(0, { duration: 600 }),
    ));

    // Phase 7: Exit animation
    const timer = setTimeout(() => {
      exitScale.value = withTiming(1.15, { duration: 300, easing: Easing.in(Easing.cubic) });
      exitOpacity.value = withTiming(0, { duration: 350, easing: Easing.in(Easing.cubic) });
      setTimeout(() => {
        onFinish();
      }, 400);
    }, 2800);

    return () => clearTimeout(timer);
  }, []);

  // Animated styles
  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: exitScale.value }],
    opacity: exitOpacity.value,
  }));

  const logoContainerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
    opacity: logoOpacity.value,
  }));

  const logoTextStyle = useAnimatedStyle(() => ({
    letterSpacing: letterSpacing.value,
  }));

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dotScale.value }],
    opacity: dotGlow.value,
  }));

  const lineStyle = useAnimatedStyle(() => ({
    width: interpolate(lineWidth.value, [0, 1], [0, width * 0.5]),
    opacity: lineWidth.value,
  }));

  const sloganStyle = useAnimatedStyle(() => ({
    opacity: sloganOpacity.value,
    transform: [{ translateY: sloganTranslateY.value }],
  }));

  const bgPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(bgPulse.value, [0, 1], [0.8, 1.5]) }],
    opacity: interpolate(bgPulse.value, [0, 0.5, 1], [0, 0.15, 0]),
  }));

  // Particles
  const useParticleStyle = (val: SharedValue<number>, offsetX: number, offsetY: number) =>
    useAnimatedStyle(() => ({
      transform: [
        { translateX: interpolate(val.value, [0, 1], [0, offsetX]) },
        { translateY: interpolate(val.value, [0, 1], [0, offsetY]) },
        { scale: interpolate(val.value, [0, 0.5, 1], [0, 1.2, 0]) },
      ],
      opacity: interpolate(val.value, [0, 0.3, 0.7, 1], [0, 0.8, 0.6, 0]),
    }));

  const p1Style = useParticleStyle(particle1, -60, -80);
  const p2Style = useParticleStyle(particle2, 70, -50);
  const p3Style = useParticleStyle(particle3, -30, 60);

  return (
    <Animated.View style={[st.container, containerStyle]}>
      {/* Background pulse ring */}
      <Animated.View style={[st.bgPulse, bgPulseStyle]} />

      {/* Particles */}
      <Animated.View style={[st.particle, p1Style, { top: height * 0.42, left: width * 0.38 }]} />
      <Animated.View style={[st.particle, st.particleSm, p2Style, { top: height * 0.43, left: width * 0.58 }]} />
      <Animated.View style={[st.particle, p3Style, { top: height * 0.48, left: width * 0.45 }]} />

      {/* Logo */}
      <Animated.View style={[st.logoContainer, logoContainerStyle]}>
        <View style={st.logoRow}>
          <Animated.Text style={[st.logoText, logoTextStyle]}>MOLI</Animated.Text>
          <Animated.View style={[st.dot, dotStyle]} />
        </View>
      </Animated.View>

      {/* Line divider */}
      <Animated.View style={[st.line, lineStyle]} />

      {/* Slogan */}
      <Animated.View style={[st.sloganContainer, sloganStyle]}>
        <Text style={st.sloganText}>MOVETE LIBRE</Text>
      </Animated.View>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  bgPulse: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(0,200,83,0.08)',
  },
  particle: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0,200,83,0.5)',
  },
  particleSm: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(0,200,83,0.3)',
  },
  logoContainer: {
    alignItems: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  logoText: {
    fontSize: 72,
    fontWeight: '900',
    color: '#0D0D0D',
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#00C853',
    marginBottom: 16,
    marginLeft: 2,
  },
  line: {
    height: 2,
    backgroundColor: 'rgba(0,200,83,0.3)',
    marginTop: 20,
    borderRadius: 1,
  },
  sloganContainer: {
    marginTop: 16,
  },
  sloganText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8E8E93',
    letterSpacing: 6,
    textAlign: 'center',
  },
});
