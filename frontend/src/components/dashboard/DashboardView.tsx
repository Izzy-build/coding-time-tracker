'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { takeFlash } from '@/lib/flash';
import { useCodingStats } from '@/lib/stats/use-coding-stats';
import { ArrowRightIcon, TrophyIcon, UserIcon } from '@/components/ui/icons';
import { useToast } from '@/components/ui/Toast';
import { TokenPanel } from './TokenPanel';
import { TotalTimeCard } from './TotalTimeCard';

function QuickLink({ href, icon: Icon, title, body }: { href: string; icon: typeof UserIcon; title: string; body: string }) {
  return (
    <Link href={href} className="group block rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong hover:bg-surface-2">
      <div className="flex items-center justify-between">
        <span className="flex size-9 items-center justify-center rounded-lg border border-line-strong bg-surface-2 text-accent">
          <Icon className="size-[18px]" />
        </span>
        <ArrowRightIcon className="size-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
      </div>
      <p className="mt-4 font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </Link>
  );
}

export function DashboardView() {
  const { session } = useAuth();
  const toast = useToast();
  const stats = useCodingStats();

  // Show the one-time message left by the sign-in screen (e.g. "Account created").
  useEffect(() => {
    const flash = takeFlash();
    if (flash) toast(flash);
  }, [toast]);

  if (!session) return null;
  const { username, name } = session.user;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10 sm:px-6 sm:py-14">
      <header className="animate-fade-in">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Welcome back, <span data-testid="welcome-username">{username}</span>
        </h1>
        {name && <p className="mt-1 text-muted">{name}</p>}
      </header>

      <div className="animate-fade-in space-y-6 [animation-delay:60ms]">
        <TotalTimeCard stats={stats} />
        <TokenPanel />
        <div className="grid gap-4 sm:grid-cols-2">
          <QuickLink href="/leaderboard" icon={TrophyIcon} title="Leaderboard" body="See how you rank against everyone else." />
          <QuickLink href="/profile" icon={UserIcon} title="Profile" body="Your account details and coding time." />
        </div>
      </div>
    </div>
  );
}
