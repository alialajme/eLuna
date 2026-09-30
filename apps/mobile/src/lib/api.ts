/**
 * AYVANA catalog client. Talks to the customer web backend's /api/mobile/*
 * JSON endpoints. On the iOS Simulator `localhost` resolves to the Mac host;
 * override with EXPO_PUBLIC_API_BASE for a device or the Android emulator.
 */
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'http://localhost:3000';

export type Category = { name: string; slug: string };

export type ProductListItem = {
  id: string;
  slug: string;
  title: string;
  price: number;
  compareAt: number | null;
  image: string | null;
  vendor: string;
  category: string;
  lowStock: boolean;
  soldOut: boolean;
};

export type CatalogResponse = { categories: Category[]; products: ProductListItem[] };

export type ProductVariant = { id: string; size: string; color: string; stock: number };

export type ProductDetail = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  price: number;
  compareAt: number | null;
  category: string;
  fabric: string | null;
  careGuide: string | null;
  images: string[];
  vendor: { id: string; name: string };
  variants: ProductVariant[];
};

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

export function fetchCatalog(category?: string): Promise<CatalogResponse> {
  const q = category && category !== 'all' ? `?category=${encodeURIComponent(category)}` : '';
  return getJSON<CatalogResponse>(`/api/mobile/products${q}`);
}

export function fetchProduct(slug: string): Promise<ProductDetail> {
  return getJSON<ProductDetail>(`/api/mobile/products/${encodeURIComponent(slug)}`);
}

/** AED price, grouped, no trailing zeros beyond 2dp. */
export function formatPrice(value: number): string {
  return `AED ${value.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// --- Checkout / Orders -----------------------------------------------------

export type CheckoutItem = { slug: string; size: string; qty: number };
export type ShippingAddress = {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  emirate?: string;
};

export async function placeOrder(items: CheckoutItem[], address: ShippingAddress): Promise<{ orderId: string; total: number }> {
  const res = await fetch(`${API_BASE}/api/mobile/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, address }),
  });
  const data = (await res.json()) as { orderId?: string; total?: number; error?: string };
  if (!res.ok || !data.orderId) throw new Error(data.error ?? 'Checkout failed');
  return { orderId: data.orderId, total: data.total ?? 0 };
}

export type OrderSummary = {
  id: string;
  reference: string;
  createdAt: string;
  status: string;
  total: number;
  itemCount: number;
  title: string;
  cover: string | null;
};

export async function fetchOrders(): Promise<OrderSummary[]> {
  const data = await getJSON<{ orders: OrderSummary[] }>(`/api/mobile/orders`);
  return data.orders;
}

// --- AI stylist chat -------------------------------------------------------

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export async function sendChat(messages: ChatMessage[]): Promise<string> {
  const res = await fetch(`${API_BASE}/api/mobile/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  const data = (await res.json()) as { reply?: string };
  return data.reply ?? "Sorry, I couldn't respond just now.";
}
