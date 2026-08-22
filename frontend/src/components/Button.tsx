import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { MOLI_COLORS, MOLI_RADIUS } from '@/src/theme/colors';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'dark';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  style,
  textStyle,
  icon,
}: ButtonProps) {
  const buttonStyles = [
    styles.button,
    styles[variant],
    styles[size],
    disabled && styles.disabled,
    style,
  ];

  const textStyles = [
    styles.text,
    styles[`${variant}Text`] as TextStyle,
    styles[`${size}Text`] as TextStyle,
    textStyle,
  ];

  return (
    <TouchableOpacity
      style={buttonStyles}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'outline' ? MOLI_COLORS.primary : '#fff'}
          size="small"
        />
      ) : (
        <>
          {icon}
          <Text style={textStyles}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: MOLI_RADIUS.lg,
    gap: 8,
    minHeight: 48,
  },
  primary: {
    backgroundColor: MOLI_COLORS.primary,
    shadowColor: MOLI_COLORS.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 2,
  },
  secondary: {
    backgroundColor: MOLI_COLORS.navySoft,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: MOLI_COLORS.lightGray,
  },
  dark: {
    backgroundColor: MOLI_COLORS.black,
  },
  danger: {
    backgroundColor: MOLI_COLORS.error,
  },
  small: {
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  medium: {
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  large: {
    paddingVertical: 18,
    paddingHorizontal: 32,
  },
  disabled: {
    opacity: 0.45,
  },
  text: {
    fontWeight: '700',
    letterSpacing: 0.15,
  },
  primaryText: {
    color: MOLI_COLORS.white,
  },
  secondaryText: {
    color: '#fff',
  },
  outlineText: {
    color: MOLI_COLORS.darkGray,
  },
  darkText: {
    color: '#fff',
  },
  dangerText: {
    color: '#fff',
  },
  smallText: {
    fontSize: 14,
  },
  mediumText: {
    fontSize: 16,
  },
  largeText: {
    fontSize: 18,
  },
});
