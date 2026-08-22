export type Fulfilment = 'pickup' | 'delivery';
export type PaymentMethod = 'cash' | 'transfer' | 'mercadopago';

export interface Merchant {
  merchant_id: string;
  name: string;
  description?: string;
  address: string;
  image_url?: string;
  approval_status: string;
  capabilities: { pickup: boolean; delivery: boolean };
  delivery_fee_cents?: number;
}

export interface Product {
  product_id: string;
  merchant_id: string;
  name: string;
  description?: string;
  image_url?: string;
  price_cents: number;
  stock: number;
  active: boolean;
}

export interface CartLine { product: Product; quantity: number }

export interface MarketOrder {
  order_id: string;
  merchant_id: string;
  customer_id: string;
  fulfilment: Fulfilment;
  payment_method: PaymentMethod;
  payment_status: string;
  status: string;
  pricing: { total_cents: number; subtotal_cents: number; delivery_fee_cents: number; items: Array<{ name: string; quantity: number }> };
  created_at: string;
}

export const ars = (value: number) => new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
}).format(value / 100);
