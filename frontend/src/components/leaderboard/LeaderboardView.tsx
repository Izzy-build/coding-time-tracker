'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getLeaderboard } from '@/lib/api/leaderboard';
import { toUserMessage } from '@/lib/api/errors';
import type { LeaderboardResponse } from '@/lib/api/schemas';
import { useAuth } from '@/lib/auth/auth-context';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { buttonClasses } from '@/components/ui/button-styles';
import { Card } from '@/components/ui/Card';
import { ChevronLeftIcon, ChevronRightIcon, TrophyIcon } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/Skeleton';

const PAGE_SIZE = 20;

type State = { phase: 'loading' | 'ready' | 'error'; data: LeaderboardResponse | null; error: string | null };

function parsePage(raw: string | null): number {
  const n = Number.parseInt(raw ?? '1', 10);
  return Number.isFinite(n) && n >= 1 && n <= 100_000 ? n : 1;
}

const podium: Record<number, string> = {
  1: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
  2: 'border-slate-300/30 bg-slate-300/10 text-slate-200',
  3: 'border-orange-400/35 bg-orange-400/10 text-orange-300',
};

export function LeaderboardView() {
  const page = parsePage(useSearchParams().get('page'));
  const { session } = useAuth();
  const me = session?.user.username.toLowerCase() ?? null;

  const [state, setState] = useState<State>({ phase: 'loading', data: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getLeaderboard(page, PAGE_SIZE, controller.signal)
      .then((data) => setState({ phase: 'ready', data, error: null }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState((prev) => ({ phase: 'error', data: prev.data, error: toUserMessage(error) }));
      });
    return () => controller.abort();
  }, [page, reloadKey]);

  const retry = () => {
    setState((prev) => ({ ...prev, phase: 'loading', error: null }));
    setReloadKey((k) => k + 1);
  };

  const { data } = state;
  const totalPages = data?.pagination.totalPages ?? 0;
  const loadingFirst = state.phase === 'loading' && !data;
  const stale = state.phase === 'loading' && data !== null; // changing page: keep old rows dimmed

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="animate-fade-in">
        <p className="flex items-center gap-2 text-sm text-accent">
          <TrophyIcon className="size-4" /> Public leaderboard
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Leaderboard</h1>
        <p className="mt-2 text-muted">Developers ranked by total coding time. People with no recorded time aren’t listed.</p>
      </header>

      <div className="mt-8 space-y-4">
        {state.error && (
          <Alert tone="error" title="Couldn’t load the leaderboard">
            {state.error}{' '}
            <button type="button" onClick={retry} className="font-medium underline underline-offset-4">
              Try again
            </button>
          </Alert>
        )}

        {loadingFirst && (
          <Card className="divide-y divide-line" aria-busy="true" aria-label="Loading leaderboard">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="size-8" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="ml-auto h-4 w-16" />
              </div>
            ))}
          </Card>
        )}

        {data && data.data.length > 0 && (
          <Card className={cn('overflow-hidden transition-opacity', stale && 'opacity-60')}>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Leaderboard page {data.pagination.page} of {totalPages}, ranked by total coding time
              </caption>
              <thead className="border-b border-line bg-surface-2/60 text-xs uppercase tracking-wider text-subtle">
                <tr>
                  <th scope="col" className="w-20 px-5 py-3 font-medium">Rank</th>
                  <th scope="col" className="px-3 py-3 font-medium">Username</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Time</th>
                  <th scope="col" className="hidden px-5 py-3 text-right font-medium sm:table-cell">Seconds</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.data.map((entry) => {
                  const isMe = me !== null && entry.username.toLowerCase() === me;
                  return (
                    <tr key={`${entry.rank}-${entry.username}`} data-testid="leaderboard-row" className={cn(isMe && 'bg-accent/[0.07]')}>
                      <td className="px-5 py-3.5">
                        <span
                          className={cn(
                            'tabular inline-flex size-8 items-center justify-center rounded-lg border text-sm font-medium',
                            podium[entry.rank] ?? 'border-transparent text-muted',
                          )}
                        >
                          {entry.rank}
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className="font-medium">{entry.username}</span>
                        {isMe && <span className="ml-2 rounded-full border border-accent/40 px-2 py-0.5 text-xs text-accent">You</span>}
                      </td>
                      <td className="tabular px-3 py-3.5 text-right font-medium">{entry.formattedTime}</td>
                      <td className="tabular hidden px-5 py-3.5 text-right text-muted sm:table-cell">{formatNumber(entry.totalSeconds)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}

        {data && data.data.length === 0 && data.pagination.total === 0 && (
          <Card className="px-6 py-14 text-center">
            <TrophyIcon className="mx-auto size-8 text-subtle" />
            <h2 className="mt-4 font-medium">Nobody is on the board yet</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              As soon as someone’s CLI reports coding time, they’ll appear here. Be the first.
            </p>
            {!session && (
              <Link href="/auth?mode=signup" className={buttonClasses('primary', 'md', 'mt-6')}>
                Create an account
              </Link>
            )}
          </Card>
        )}

        {data && data.data.length === 0 && data.pagination.total > 0 && (
          <Card className="px-6 py-12 text-center">
            <h2 className="font-medium">That page doesn’t exist</h2>
            <p className="mt-2 text-sm text-muted">The leaderboard only has {totalPages} {totalPages === 1 ? 'page' : 'pages'}.</p>
            <Link href="/leaderboard" className={buttonClasses('secondary', 'md', 'mt-6')}>
              Back to the top
            </Link>
          </Card>
        )}

        {data && data.pagination.total > 0 && totalPages > 1 && (
          <nav aria-label="Leaderboard pages" className="flex items-center justify-between gap-3 pt-2">
            <p className="tabular text-sm text-muted" aria-live="polite">
              Page {data.pagination.page} of {totalPages} · {formatNumber(data.pagination.total)} developers
            </p>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link href={page - 1 === 1 ? '/leaderboard' : `/leaderboard?page=${page - 1}`} scroll={false} className={buttonClasses('secondary', 'sm')}>
                  <ChevronLeftIcon className="size-4" /> Previous
                </Link>
              ) : (
                <Button variant="secondary" size="sm" disabled>
                  <ChevronLeftIcon className="size-4" /> Previous
                </Button>
              )}
              {page < totalPages ? (
                <Link href={`/leaderboard?page=${page + 1}`} scroll={false} className={buttonClasses('secondary', 'sm')}>
                  Next <ChevronRightIcon className="size-4" />
                </Link>
              ) : (
                <Button variant="secondary" size="sm" disabled>
                  Next <ChevronRightIcon className="size-4" />
                </Button>
              )}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}
