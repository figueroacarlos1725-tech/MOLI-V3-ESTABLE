import React, { createContext, useContext, useMemo, useState } from 'react';
import { apiService } from '@/src/services/api';
import { CartLine, Merchant, Product } from './types';

interface CartValue {
  merchant: Merchant | null;
  lines: CartLine[];
  count: number;
  subtotalCents: number;
  add: (merchant: Merchant, product: Product) => Promise<void>;
  change: (productId: string, quantity: number) => Promise<void>;
  clear: () => void;
}

const CartContext = createContext<CartValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);

  const put = async (product: Product, quantity: number) => {
    await apiService.put('/marketplace/cart/items', { product_id: product.product_id, quantity });
  };
  const add = async (nextMerchant: Merchant, product: Product) => {
    if (merchant && merchant.merchant_id !== nextMerchant.merchant_id) {
      throw new Error('Tu carrito ya contiene productos de otro comercio');
    }
    const quantity = (lines.find((x) => x.product.product_id === product.product_id)?.quantity || 0) + 1;
    await put(product, quantity);
    setMerchant(nextMerchant);
    setLines((current) => current.some((x) => x.product.product_id === product.product_id)
      ? current.map((x) => x.product.product_id === product.product_id ? { ...x, quantity } : x)
      : [...current, { product, quantity }]);
  };
  const change = async (productId: string, quantity: number) => {
    const line = lines.find((x) => x.product.product_id === productId);
    if (!line || quantity < 1) return;
    await put(line.product, quantity);
    setLines((current) => current.map((x) => x.product.product_id === productId ? { ...x, quantity } : x));
  };
  const clear = () => { setMerchant(null); setLines([]); };
  const value = useMemo(() => ({ merchant, lines, add, change, clear,
    count: lines.reduce((sum, x) => sum + x.quantity, 0),
    subtotalCents: lines.reduce((sum, x) => sum + x.quantity * x.product.price_cents, 0),
  }), [merchant, lines]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useMarketCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error('useMarketCart must be inside CartProvider');
  return value;
}
