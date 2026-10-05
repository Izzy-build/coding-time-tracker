'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { setSessionFailureHandler } from '@/lib/api/client';
import type { SigninResponse } from '@/lib/api/schemas';
import { cliTokenStore } from './cli-token-store';
import { setEndReason, type EndReason } from './end-reason';
import { sessionStore, toStoredSession, type StoredSession } from './session-store';

type Status = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  /** `loading` until the browser storage has been read (never redirect while loading). */
  status: Status;
  session: StoredSession | null;
  signIn: (response: SigninResponse) => void;
  signOut: (reason?: EndReason) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const noopSubscribe = () => () => undefined;

/** false during server render and the hydration pass, true afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** Longest delay setTimeout can represent (~24.8 days). */
const MAX_TIMER_MS = 2_147_000_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const stored = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot, sessionStore.getServerSnapshot);
  const session = hydrated ? stored : null;

  const signOut = useCallback((reason: EndReason = 'signed-out') => {
    if (!sessionStore.getSnapshot()) return; // already signed out: nothing to do (and no duplicate redirects)
    setEndReason(reason);
    cliTokenStore.clear();
    sessionStore.clear();
  }, []);

  const signIn = useCallback((response: SigninResponse) => {
    setEndReason(null);
    cliTokenStore.clear(); // never carry a previous account's CLI token into a new session
    sessionStore.write(toStoredSession(response));
  }, []);

  // Don't leave an expired (or corrupted) session lying around in the browser.
  useEffect(() => {
    if (!hydrated) return;
    sessionStore.purgeInvalid();
    cliTokenStore.purgeInvalid();
  }, [hydrated]);

  // The API client reports a rejected JWT here: sign out once, and explain why on the sign-in page.
  useEffect(() => {
    setSessionFailureHandler((error) => signOut(error.code === 'TOKEN_EXPIRED' ? 'expired' : 'invalid'));
    return () => setSessionFailureHandler(null);
  }, [signOut]);

  // Expire the session on time even if the tab stays open, and re-check when the tab wakes up.
  const expiresAt = session?.expiresAt ?? null;
  useEffect(() => {
    if (expiresAt === null) return;
    const check = () => {
      if (Date.now() >= expiresAt) signOut('expired');
    };
    const delay = Math.min(Math.max(expiresAt - Date.now(), 0), MAX_TIMER_MS);
    const timer = window.setTimeout(check, delay);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [expiresAt, signOut]);

  const value = useMemo<AuthContextValue>(
    () => ({ status: !hydrated ? 'loading' : session ? 'authenticated' : 'unauthenticated', session, signIn, signOut }),
    [hydrated, session, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
