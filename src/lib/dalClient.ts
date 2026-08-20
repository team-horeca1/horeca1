/**
 * Thin client DAL surface for root/storefront chrome (Cart + Navbar).
 * Avoids pulling the full vendors/products/orders graph into every page.
 */
import type { Category } from '@/types';

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  return process.env.AUTH_URL || 'http://localhost:3000';
}

const API_FETCH_TIMEOUT_MS = 15_000;

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const timeoutSignal = AbortSignal.timeout(API_FETCH_TIMEOUT_MS);
  const signal = options?.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;
  const res = await fetch(url, {
    ...options,
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(error.error?.message || `API Error: ${res.status}`);
  }

  const json = await res.json();
  return json.data ?? json;
}

function toCategory(c: Record<string, unknown>): Category {
  return {
    id: c.id as string,
    name: (c.name as string) || '',
    slug: (c.slug as string) || '',
    image: (c.imageUrl as string) || '/images/category/vegitable.png',
    parentId: (c.parentId as string) || undefined,
    isActive: (c.isActive as boolean) ?? true,
  };
}

export const dalClient = {
  categories: {
    async list() {
      const data = await apiFetch<Record<string, unknown>[]>('/api/v1/categories');
      return data.map(toCategory);
    },
  },
  cart: {
    async get() {
      return apiFetch<{ vendorGroups: unknown[]; total: number }>('/api/v1/cart');
    },
    async addItem(productId: string, vendorId: string, quantity: number) {
      return apiFetch('/api/v1/cart', {
        method: 'POST',
        body: JSON.stringify({ productId, vendorId, quantity }),
      });
    },
    async updateItem(itemId: string, quantity: number) {
      return apiFetch(`/api/v1/cart/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity }),
      });
    },
    async removeItem(itemId: string) {
      return apiFetch(`/api/v1/cart/items/${itemId}`, { method: 'DELETE' });
    },
    async clear() {
      return apiFetch('/api/v1/cart', { method: 'DELETE' });
    },
  },
};
