'use client';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { RefreshIcon } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDuration, formatHours, formatNumber } from '@/lib/format';
import type { useCodingStats } from '@/lib/stats/use-coding-stats';

type Stats = ReturnType<typeof useCodingStats>;

export function TotalTimeCard({ stats }: { stats: Stats }) {
  const { phase, data, error, reload } = stats;
  const total = data?.totalSeconds ?? null;
  const firstLoad = phase === 'loading' && !data;

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">Total coding time</p>
        <Button variant="ghost" size="sm" onClick={reload} disabled={phase === 'loading'} aria-label="Refresh total coding time">
          <RefreshIcon className={phase === 'loading' ? 'size-4 animate-spin' : 'size-4'} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {firstLoad ? (
        <div className="mt-6 space-y-3" aria-busy="true" aria-label="Loading total coding time">
          <Skeleton className="h-14 w-48" />
          <Skeleton className="h-4 w-56" />
        </div>
      ) : (
        <div className="mt-4">
          <p data-testid="total-formatted" className="tabular text-5xl font-semibold tracking-tight sm:text-6xl">
            {total === null ? '—' : formatDuration(total)}
          </p>
          <p data-testid="total-detail" className="tabular mt-3 text-sm text-muted">
            {total === null
              ? 'Your total could not be determined right now.'
              : `${formatNumber(total)} seconds · ${formatHours(total)} hours`}
            {data?.rank != null && <span className="ml-2 rounded-full border border-line-strong px-2 py-0.5 text-xs text-fg">Rank #{data.rank}</span>}
          </p>
          {total === 0 && (
            <p className="mt-4 text-sm leading-relaxed text-muted">
              No coding time recorded yet. Generate your CLI token below, connect the CLI, and your time will show up here.
            </p>
          )}
        </div>
      )}

      {error && (
        <Alert tone="error" className="mt-5">
          {error}{' '}
          <button type="button" onClick={reload} className="font-medium underline underline-offset-4">
            Try again
          </button>
        </Alert>
      )}
      {data?.tokenWasRejected && (
        <Alert tone="warning" className="mt-5" title="Your CLI token is no longer active">
          It was replaced or revoked. Use “Update token” below to get a new one.
        </Alert>
      )}
    </Card>
  );
}
