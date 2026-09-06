/**
 * Moli Design System — Theme Constants
 * Moli visual language: warm, direct and professional.
 * Brand: route-orange + charcoal. Semantic green is reserved for success.
 */

export const MOLI_COLORS = {
  // Primary brand
  primary: '#FF5A1F',
  primaryDark: '#E9480B',
  primaryLight: '#FFD9C7',
  primaryGlow: 'rgba(255, 90, 31, 0.11)',
  navy: '#202124', // backwards-compatible name: now brand charcoal
  navySoft: '#34363A',
  indigo: '#FF5A1F', // backwards-compatible alias
  coral: '#FF5A1F',

  // Neutrals
  black: '#202124',
  darkGray: '#2E3033',
  gray: '#64666B',
  mediumGray: '#8A8D91',
  lightGray: '#DDDED9',
  offWhite: '#F5F4F1',
  white: '#FFFFFF',

  // Semantic
  success: '#19A974',
  warning: '#F4A340',
  error: '#E94F5F',
  info: '#4676ED',

  // Surfaces
  cardBg: '#FFFFFF',
  surface: '#FAF9F6',
  surfaceRaised: '#FFFFFF',
  surfaceDark: '#202124',
  overlay: 'rgba(32, 33, 36, 0.58)',

  // Accent (secondary for driver-specific)
  accent: '#FF5A1F',
  accentLight: 'rgba(255, 90, 31, 0.10)',
};

export const MOLI_SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
};

export const MOLI_RADIUS = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
};

export const MOLI_SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};
