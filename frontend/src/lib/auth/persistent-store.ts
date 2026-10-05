/**
 * A tiny external store backed by Web Storage, shaped for `useSyncExternalStore`:
 *  - `getSnapshot` returns a referentially stable value (re-parsed only when the raw string changes)
 *  - `getServerSnapshot` is always null (no storage on the server)
 *  - changes made in other tabs are picked up through the `storage` event (localStorage)
 *  - if storage is unavailable (private mode, blocked) it degrades to in-memory for the page lifetime
 */
export interface PersistentStore<T> {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T | null;
  getServerSnapshot: () => null;
  write: (value: T) => void;
  clear: () => void;
  /** Deletes a stored entry that is no longer valid (expired session, corrupted JSON). */
  purgeInvalid: () => void;
}

export function createPersistentStore<T>(options: {
  key: string;
  area: 'local' | 'session';
  parse: (raw: string) => T | null;
  serialize: (value: T) => string;
}): PersistentStore<T> {
  const listeners = new Set<() => void>();
  let memoryRaw: string | null = null;
  let cachedRaw: string | null | undefined;
  let cachedValue: T | null = null;

  const area = (): Storage | null => {
    try {
      if (typeof window === 'undefined') return null;
      return options.area === 'local' ? window.localStorage : window.sessionStorage;
    } catch {
      return null;
    }
  };

  const readRaw = (): string | null => {
    try {
      return area()?.getItem(options.key) ?? memoryRaw;
    } catch {
      return memoryRaw;
    }
  };

  const writeRaw = (raw: string | null): void => {
    memoryRaw = raw;
    try {
      const storage = area();
      if (!storage) return;
      if (raw === null) storage.removeItem(options.key);
      else storage.setItem(options.key, raw);
    } catch {
      /* storage full or blocked: memory fallback already holds the value */
    }
  };

  const notify = () => listeners.forEach((listener) => listener());

  return {
    subscribe(listener) {
      listeners.add(listener);
      const onStorage = (event: StorageEvent) => {
        if (options.area === 'local' && (event.key === options.key || event.key === null)) listener();
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
      };
    },
    getSnapshot() {
      const raw = readRaw();
      if (raw !== cachedRaw) {
        cachedRaw = raw;
        cachedValue = raw === null ? null : options.parse(raw);
      }
      return cachedValue;
    },
    getServerSnapshot: () => null,
    write(value) {
      writeRaw(options.serialize(value));
      notify();
    },
    clear() {
      writeRaw(null);
      notify();
    },
    purgeInvalid() {
      const raw = readRaw();
      if (raw !== null && options.parse(raw) === null) {
        writeRaw(null);
        notify();
      }
    },
  };
}
