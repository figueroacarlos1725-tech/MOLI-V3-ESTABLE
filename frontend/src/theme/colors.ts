/**
 * Moli Design System — Theme Constants
 * Green/Black identity inspired by the logo
 */

export const MOLI_COLORS = {
  // Primary brand
  primary: '#00C853',       // Moli green
  primaryDark: '#00A843',   // Darker green for pressed states
  primaryLight: '#B9F6CA',  // Light green tint
  primaryGlow: 'rgba(0, 200, 83, 0.15)', // Subtle green background

  // Neutrals
  black: '#0D0D0D',
  darkGray: '#1C1C1E',
  gray: '#636366',
  mediumGray: '#8E8E93',
  lightGray: '#C7C7CC',
  offWhite: '#F2F2F7',
  white: '#FFFFFF',

  // Semantic
  success: '#34C759',
  warning: '#FF9500',
  error: '#FF3B30',
  info: '#007AFF',

  // Surfaces
  cardBg: '#FFFFFF',
  surfaceDark: '#1A1A1A',
  overlay: 'rgba(0, 0, 0, 0.6)',

  // Accent (secondary for driver-specific)
  accent: '#00C853',
  accentLight: 'rgba(0, 200, 83, 0.1)',
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
