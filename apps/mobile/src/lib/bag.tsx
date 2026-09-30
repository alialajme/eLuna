import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'ayvana.bag.v1';

export type BagLine = {
  key: string; // slug + size
  slug: string;
  title: string;
  vendor: string;
  size: string;
  price: number;
  image: string | null;
  qty: number;
};

type BagContext = {
  lines: BagLine[];
  count: number;
  subtotal: number;
  add: (line: Omit<BagLine, 'key' | 'qty'>) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
};

const Ctx = createContext<BagContext | null>(null);

/** In-memory bag for the demo build (resets on reload); swaps for the real cart later. */
export function BagProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<BagLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Load persisted bag on mount.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setLines(JSON.parse(raw) as BagLine[]);
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  // Persist after hydration so we never clobber storage with the initial [].
  useEffect(() => {
    if (hydrated) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(lines)).catch(() => {});
  }, [lines, hydrated]);

  const add: BagContext['add'] = useCallback((line) => {
    const key = `${line.slug}::${line.size}`;
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) return prev.map((l) => (l.key === key ? { ...l, qty: Math.min(l.qty + 1, 99) } : l));
      return [...prev, { ...line, key, qty: 1 }];
    });
  }, []);

  const setQty: BagContext['setQty'] = useCallback((key, qty) => {
    setLines((prev) =>
      qty <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, qty } : l)),
    );
  }, []);

  const remove: BagContext['remove'] = useCallback((key) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<BagContext>(() => {
    const count = lines.reduce((n, l) => n + l.qty, 0);
    const subtotal = lines.reduce((n, l) => n + l.qty * l.price, 0);
    return { lines, count, subtotal, add, setQty, remove, clear };
  }, [lines, add, setQty, remove, clear]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBag() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBag must be used within BagProvider');
  return ctx;
}
