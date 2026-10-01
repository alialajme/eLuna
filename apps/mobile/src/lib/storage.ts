// Safe persistent key-value storage.
//
// Uses @react-native-async-storage/async-storage when its native module is
// linked into the app binary; otherwise falls back to an in-memory store for
// the session. Critically, AsyncStorage is loaded with a guarded `require` so
// that a missing/unlinked native module can NEVER throw at module-eval time
// (which would cascade into an expo-router "ErrorBoundary of undefined" crash).

type KV = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

let backend: KV | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('@react-native-async-storage/async-storage');
  const AS = (mod && (mod.default ?? mod)) as Partial<KV> | undefined;
  if (AS && typeof AS.getItem === 'function') backend = AS as KV;
} catch {
  backend = null;
}

const mem = new Map<string, string>();
const memory: KV = {
  getItem: async (k) => (mem.has(k) ? mem.get(k)! : null),
  setItem: async (k, v) => {
    mem.set(k, v);
  },
  removeItem: async (k) => {
    mem.delete(k);
  },
};

/** Whether persistence is backed by a real native store (vs session memory). */
export const isPersistent = backend != null;

/** Storage that always works — real persistence when available, memory otherwise. */
export const storage: KV = {
  getItem: async (k) => {
    try {
      return await (backend ?? memory).getItem(k);
    } catch {
      return memory.getItem(k);
    }
  },
  setItem: async (k, v) => {
    try {
      await (backend ?? memory).setItem(k, v);
    } catch {
      await memory.setItem(k, v);
    }
  },
  removeItem: async (k) => {
    try {
      await (backend ?? memory).removeItem(k);
    } catch {
      await memory.removeItem(k);
    }
  },
};
