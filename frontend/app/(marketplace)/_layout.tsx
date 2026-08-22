import React from 'react';
import { Stack } from 'expo-router';
import { CartProvider } from '@/src/marketplace/CartContext';

export default function MarketplaceLayout() {
  return <CartProvider><Stack screenOptions={{ headerShown: false }} /></CartProvider>;
}
