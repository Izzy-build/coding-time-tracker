'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, toUserMessage } from '@/lib/api/errors';
import { findStanding } from '@/lib/api/leaderboard';
import { getProfile } from '@/lib/api/profile';
import type { CliProfile } from '@/lib/api/schemas';
import { useAuth } from '@/lib/auth/auth-context';
import { useCliToken } from '@/lib/token/use-cli-token';

export interface CodingStats {
  /** Total seconds, or null when it could not be determined. */
  totalSeconds: number | null;
  /** Leaderboard rank when known (only available through the leaderboard fallback). */
  rank: number | null;
  /** Live profile from GET /profile/:token (only when a CLI token is held in this tab). */
  profile: CliProfile | null;
  source: 'profile' | 'leaderboard';
  /** The stored CLI token was rejected (rotated elsewhere / revoked) and has been discarded. */
  tokenWasRejected: boolean;
}

type State = { phase: 'loading' | 'ready' | 'error'; data: CodingStats | null; error: string | null };

/**
 * Loads the user's coding total.
 *  1. With a CLI token in this tab: GET /profile/:token (exact, one request).
 *  2. Without one (new tab, returning user): find the user on the public leaderboard.
 * If the stored token turns out to be revoked, it is discarded and we fall back to (2).
 */
export function useCodingStats() {
  const { session } = useAuth();
  const { token, clear } = useCliToken();
  const [state, setState] = useState<State>({ phase: 'loading', data: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);
  // Clearing a rejected token re-runs the effect below; this remembers WHY the token is gone across that re-run.
  const rejectedRef = useRef(false);

  const username = session?.user.username ?? null;

  useEffect(() => {
    if (!username) return;
    const controller = new AbortController();
    const { signal } = controller;

    async function viaLeaderboard(): Promise<CodingStats> {
      const standing = await findStanding(username as string, signal);
      return {
        totalSeconds: standing.kind === 'found' ? standing.entry.totalSeconds : standing.kind === 'absent' ? 0 : null,
        rank: standing.kind === 'found' ? standing.entry.rank : null,
        profile: null,
        source: 'leaderboard',
        tokenWasRejected: rejectedRef.current,
      };
    }

    async function run() {
      try {
        let data: CodingStats;
        if (token) {
          try {
            const profile = await getProfile(token, signal);
            rejectedRef.current = false;
            data = { totalSeconds: profile.totalSeconds, rank: null, profile, source: 'profile', tokenWasRejected: false };
          } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
              rejectedRef.current = true;
              clear(); // the token was rotated/revoked elsewhere (this re-runs the effect without a token)
              data = await viaLeaderboard();
            } else {
              throw error;
            }
          }
        } else {
          data = await viaLeaderboard();
        }
        if (!signal.aborted) setState({ phase: 'ready', data, error: null });
      } catch (error) {
        if (signal.aborted) return;
        setState((prev) => ({ phase: 'error', data: prev.data, error: toUserMessage(error) }));
      }
    }

    void run();
    return () => controller.abort();
  }, [username, token, clear, reloadKey]);

  const reload = useCallback(() => {
    setState((prev) => ({ ...prev, phase: 'loading', error: null }));
    setReloadKey((k) => k + 1);
  }, []);

  return { ...state, reload };
}
