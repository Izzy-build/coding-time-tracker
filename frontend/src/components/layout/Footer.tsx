'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-context';

export function Footer() {
  const { status } = useAuth();

  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-3 px-4 py-8 text-sm text-subtle sm:flex-row sm:items-center sm:px-6">
        <p>© {new Date().getFullYear()} Coding Time Tracker</p>
        <nav aria-label="Footer" className="flex gap-5">
          <Link href="/leaderboard" className="transition-colors hover:text-fg">
            Leaderboard
          </Link>
          {status === 'authenticated' && (
            <Link href="/dashboard" className="transition-colors hover:text-fg">
              Dashboard
            </Link>
          )}
          {status === 'unauthenticated' && (
            <Link href="/auth?mode=login" className="transition-colors hover:text-fg">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </footer>
  );
}
