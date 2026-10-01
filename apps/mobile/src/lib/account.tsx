import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { ShippingAddress } from '@/lib/api';
import { storage } from '@/lib/storage';

const STORAGE_KEY = 'ayvana.account.v1';

export type SizeProfile = {
  height?: string;
  bust?: string;
  waist?: string;
  hip?: string;
  usualSize?: string;
};

export type Preferences = {
  sizeSystem: 'UK' | 'US' | 'EU' | 'UAE';
  offers: boolean;
  orderUpdates: boolean;
  arabic: boolean;
};

type AccountState = {
  user: { name: string; email: string } | null;
  address: ShippingAddress | null;
  size: SizeProfile | null;
  prefs: Preferences;
};

const DEFAULTS: AccountState = {
  user: null,
  address: null,
  size: null,
  prefs: { sizeSystem: 'UK', offers: true, orderUpdates: true, arabic: false },
};

type AccountContext = AccountState & {
  signedIn: boolean;
  signIn: (name: string, email: string) => void;
  signOut: () => void;
  setAddress: (a: ShippingAddress) => void;
  setSize: (s: SizeProfile) => void;
  setPrefs: (p: Partial<Preferences>) => void;
};

const Ctx = createContext<AccountContext | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccountState>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    storage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setState({ ...DEFAULTS, ...(JSON.parse(raw) as AccountState) });
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (hydrated) storage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, hydrated]);

  const value = useMemo<AccountContext>(
    () => ({
      ...state,
      signedIn: state.user != null,
      signIn: (name, email) => setState((s) => ({ ...s, user: { name: name.trim(), email: email.trim() } })),
      signOut: () => setState((s) => ({ ...s, user: null })),
      setAddress: (address) => setState((s) => ({ ...s, address })),
      setSize: (size) => setState((s) => ({ ...s, size })),
      setPrefs: (p) => setState((s) => ({ ...s, prefs: { ...s.prefs, ...p } })),
    }),
    [state],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccount() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAccount must be used within AccountProvider');
  return ctx;
}
