'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';
import { Footer } from '@/components/layout/Footer';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/lib/auth/auth-context';
import { peekEndReason } from '@/lib/auth/end-reason';

/**
 * Guard for signed-in pages. Redirects to the sign-in page exactly once when there is no session.
 * There is no way to loop: the sign-in page only redirects AWAY when a session exists, this guard only
 * redirects away when none does, and neither redirects while the stored session is still being read.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  // Redirect at most once per mount: while the route transition is in flight this layout is still mounted, and a
  // second redirect (after the sign-in page has already consumed the reason) would overwrite the first.
  const redirected = useRef(false);

  useEffect(() => {
    if (status !== 'unauthenticated' || redirected.current) return;
    redirected.current = true;
    const reason = peekEndReason();
    if (reason === 'signed-out') return; // the header is already navigating home
    router.replace(reason === 'expired' || reason === 'invalid' ? `/auth?mode=login&reason=${reason}` : '/auth?mode=login');
  }, [status, router]);

  return (
    <>
      <SiteHeader />
      <main id="main" className="min-h-[60dvh]">
        {status === 'authenticated' ? (
          children
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-14 sm:px-6" aria-busy="true" aria-label="Loading">
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
