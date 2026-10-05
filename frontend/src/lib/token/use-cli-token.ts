'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { cliTokenStore } from '@/lib/auth/cli-token-store';

/** The raw CLI token held in this tab (if any), bound to the signed-in user. */
export function useCliToken() {
  const { session } = useAuth();
  const stored = useSyncExternalStore(cliTokenStore.subscribe, cliTokenStore.getSnapshot, cliTokenStore.getServerSnapshot);
  const userId = session?.user.userId ?? null;
  const token = stored && userId && stored.userId === userId ? stored.token : null;

  const save = useCallback(
    (value: string) => {
      if (userId) cliTokenStore.write({ userId, token: value });
    },
    [userId],
  );
  const clear = useCallback(() => cliTokenStore.clear(), []);

  return { token, save, clear };
}
