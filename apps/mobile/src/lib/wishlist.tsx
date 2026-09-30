import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { ProductListItem } from '@/lib/api';

const STORAGE_KEY = 'ayvana.wishlist.v1';

type WishlistContext = {
  items: ProductListItem[];
  count: number;
  has: (slug: string) => boolean;
  toggle: (item: ProductListItem) => void;
  remove: (slug: string) => void;
};

const Ctx = createContext<WishlistContext | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ProductListItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setItems(JSON.parse(raw) as ProductListItem[]);
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (hydrated) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {});
  }, [items, hydrated]);

  const toggle = useCallback((item: ProductListItem) => {
    setItems((prev) =>
      prev.some((p) => p.slug === item.slug) ? prev.filter((p) => p.slug !== item.slug) : [item, ...prev],
    );
  }, []);

  const remove = useCallback((slug: string) => {
    setItems((prev) => prev.filter((p) => p.slug !== slug));
  }, []);

  const value = useMemo<WishlistContext>(
    () => ({
      items,
      count: items.length,
      has: (slug) => items.some((p) => p.slug === slug),
      toggle,
      remove,
    }),
    [items, toggle, remove],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWishlist() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWishlist must be used within WishlistProvider');
  return ctx;
}
