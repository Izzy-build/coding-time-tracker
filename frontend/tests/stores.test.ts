import { beforeEach, describe, expect, it, vi } from 'vitest';
import { peekEndReason, setEndReason } from '@/lib/auth/end-reason';
import { createPersistentStore } from '@/lib/auth/persistent-store';
import { sessionStore, toStoredSession } from '@/lib/auth/session-store';

/** Minimal in-memory stand-ins for the browser APIs the stores use. */
class FakeStorage {
  private data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
  removeItem = (k: string) => void this.data.delete(k);
}
let local: FakeStorage;
let session: FakeStorage;

beforeEach(() => {
  local = new FakeStorage();
  session = new FakeStorage();
  vi.stubGlobal('window', { localStorage: local, sessionStorage: session, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  setEndReason(null);
});

const user = { userId: 'u1', username: 'izzy', name: null, email: 'i@example.com', createdAt: '2026-10-01T00:00:00.000Z' };
const signinResponse = { token: 'jwt.value.here', tokenType: 'Bearer' as const, expiresIn: 3600, user };

describe('persistent store', () => {
  const make = () =>
    createPersistentStore<{ n: number }>({
      key: 'k',
      area: 'local',
      parse: (raw) => {
        try {
          const v = JSON.parse(raw) as { n?: unknown };
          return typeof v.n === 'number' ? { n: v.n } : null;
        } catch {
          return null;
        }
      },
      serialize: (v) => JSON.stringify(v),
    });

  it('returns a referentially stable snapshot until the stored value changes', () => {
    const store = make();
    expect(store.getSnapshot()).toBeNull();
    store.write({ n: 1 });
    const a = store.getSnapshot();
    expect(a).toEqual({ n: 1 });
    expect(store.getSnapshot()).toBe(a); // same object: safe for useSyncExternalStore
    store.write({ n: 2 });
    expect(store.getSnapshot()).toEqual({ n: 2 });
  });

  it('notifies subscribers on write and clear, and stops after unsubscribe', () => {
    const store = make();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.write({ n: 1 });
    store.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.write({ n: 3 });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('server snapshot is always null', () => expect(make().getServerSnapshot()).toBeNull());

  it('corrupted data reads as empty and can be purged', () => {
    const store = make();
    local.setItem('k', '{not json');
    expect(store.getSnapshot()).toBeNull();
    store.purgeInvalid();
    expect(local.getItem('k')).toBeNull();
  });

  it('purgeInvalid leaves valid data alone', () => {
    const store = make();
    store.write({ n: 7 });
    store.purgeInvalid();
    expect(store.getSnapshot()).toEqual({ n: 7 });
  });

  it('falls back to memory when storage throws (private mode)', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new Error('blocked');
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const store = make();
    store.write({ n: 5 });
    expect(store.getSnapshot()).toEqual({ n: 5 });
  });
});

describe('session store', () => {
  it('stores the JWT with an absolute expiry derived from expiresIn', () => {
    const stored = toStoredSession(signinResponse, 1_000_000);
    expect(stored).toEqual({ token: 'jwt.value.here', expiresAt: 1_000_000 + 3_600_000, user });
  });

  it('round-trips a live session', () => {
    sessionStore.write(toStoredSession(signinResponse));
    expect(sessionStore.getSnapshot()).toMatchObject({ token: 'jwt.value.here', user });
    sessionStore.clear();
    expect(sessionStore.getSnapshot()).toBeNull();
  });

  it('never stores a password (nothing but the JWT, expiry and public profile fields)', () => {
    sessionStore.write(toStoredSession(signinResponse));
    const raw = local.getItem('ctt.session.v1') ?? '';
    expect(Object.keys(JSON.parse(raw) as object).sort()).toEqual(['expiresAt', 'token', 'user']);
    expect(raw).not.toMatch(/password/i);
  });

  it('treats an expired session as signed out, records why, and purges it', () => {
    sessionStore.write(toStoredSession(signinResponse, Date.now() - 2 * 3_600_000));
    expect(sessionStore.getSnapshot()).toBeNull();
    expect(peekEndReason()).toBe('expired');
    sessionStore.purgeInvalid();
    expect(local.getItem('ctt.session.v1')).toBeNull();
  });

  it('treats a session that expires within the safety margin as already expired', () => {
    sessionStore.write({ token: 't', expiresAt: Date.now() + 5_000, user });
    expect(sessionStore.getSnapshot()).toBeNull();
  });

  it('rejects structurally invalid stored data', () => {
    local.setItem('ctt.session.v1', JSON.stringify({ token: 't', expiresAt: 'soon', user: {} }));
    expect(sessionStore.getSnapshot()).toBeNull();
  });
});
