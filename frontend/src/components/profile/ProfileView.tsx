'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-context';
import { formatDate, formatDuration, formatHours, formatNumber } from '@/lib/format';
import { useCodingStats } from '@/lib/stats/use-coding-stats';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { RefreshIcon } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/Skeleton';

function Row({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="grid gap-1 px-5 py-4 sm:grid-cols-[11rem_1fr] sm:gap-4 sm:px-6">
      <dt className="text-sm text-subtle">{label}</dt>
      <dd data-testid={testId} className="min-w-0 break-words text-[15px]">
        {children}
      </dd>
    </div>
  );
}

/**
 * Safe profile fields only. When this tab holds the CLI token the data comes from GET /profile/:token;
 * otherwise the same fields come from the sign-in response and the total from the public leaderboard.
 */
export function ProfileView() {
  const { session } = useAuth();
  const stats = useCodingStats();
  if (!session) return null;

  const live = stats.data?.profile ?? null;
  const user = live ?? session.user;
  const total = stats.data?.totalSeconds ?? null;
  const loadingTotal = stats.phase === 'loading' && !stats.data;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10 sm:px-6 sm:py-14">
      <header className="flex animate-fade-in items-center gap-4">
        <span
          aria-hidden="true"
          className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-line-strong bg-surface-2 text-xl font-semibold text-accent"
        >
          {user.username.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{user.username}</h1>
          <p className="text-muted">Your profile</p>
        </div>
      </header>

      {!live && stats.phase !== 'loading' && (
        <Alert tone="info" title="Showing the details from your sign-in">
          Live profile data uses your CLI token, which isn’t available in this browser tab. Generate or update it on the{' '}
          <Link href="/dashboard" className="font-medium underline underline-offset-4">
            dashboard
          </Link>{' '}
          to load it here.
        </Alert>
      )}
      {stats.data?.tokenWasRejected && (
        <Alert tone="warning" title="Your CLI token is no longer active">
          It was replaced or revoked. Update it on the dashboard to get a new one.
        </Alert>
      )}
      {stats.error && <Alert tone="error">{stats.error}</Alert>}

      <Card className="animate-fade-in overflow-hidden [animation-delay:60ms]">
        <dl className="divide-y divide-line">
          <Row label="Username" testId="profile-username">
            {user.username}
          </Row>
          <Row label="Name" testId="profile-name">
            {user.name ?? <span className="text-subtle">Not set</span>}
          </Row>
          <Row label="Email" testId="profile-email">
            {user.email}
          </Row>
          <Row label="Member since" testId="profile-created">
            {formatDate(user.createdAt)}
          </Row>
          <Row label="Total coding time" testId="profile-total">
            {loadingTotal ? (
              <Skeleton className="h-5 w-40" />
            ) : total === null ? (
              <span className="text-subtle">Unavailable</span>
            ) : (
              <span className="tabular">
                <span className="font-medium">{formatDuration(total)}</span>
                <span className="ml-2 text-muted">
                  {formatNumber(total)} seconds · {formatHours(total)} hours
                </span>
              </span>
            )}
          </Row>
        </dl>
      </Card>

      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={stats.reload} disabled={stats.phase === 'loading'}>
          <RefreshIcon className={stats.phase === 'loading' ? 'size-4 animate-spin' : 'size-4'} /> Refresh
        </Button>
      </div>
    </div>
  );
}
