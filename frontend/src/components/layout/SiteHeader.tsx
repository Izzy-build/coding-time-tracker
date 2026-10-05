'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { LogoutIcon } from '@/components/ui/icons';
import { useAuth } from '@/lib/auth/auth-context';
import { cn } from '@/lib/utils';

function NavLink({ href, children }: { href: string; children: string }) {
  const active = usePathname() === href;
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-md px-2.5 py-2 text-sm transition-colors sm:px-3',
        active ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg',
      )}
    >
      {children}
    </Link>
  );
}

export function SiteHeader() {
  const { status, signOut } = useAuth();
  const router = useRouter();

  function onSignOut() {
    signOut('signed-out');
    router.push('/');
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="flex items-center gap-0.5 sm:gap-1.5">
          {status === 'authenticated' && (
            <>
              <NavLink href="/dashboard">Dashboard</NavLink>
              <NavLink href="/leaderboard">Leaderboard</NavLink>
              <NavLink href="/profile">Profile</NavLink>
              <Button variant="ghost" size="sm" onClick={onSignOut} className="ml-0.5" aria-label="Sign out">
                <LogoutIcon className="size-4" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </>
          )}
          {status === 'unauthenticated' && (
            <>
              <NavLink href="/leaderboard">Leaderboard</NavLink>
              <ButtonLink href="/auth?mode=login" variant="ghost" size="sm">
                Sign in
              </ButtonLink>
              <ButtonLink href="/auth?mode=signup" size="sm">
                Create account
              </ButtonLink>
            </>
          )}
          {/* While storage is being read, reserve the space so the header doesn't jump. */}
          {status === 'loading' && <div className="h-8 w-48" aria-hidden="true" />}
        </nav>
      </div>
    </header>
  );
}
