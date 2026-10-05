import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LeaderboardView } from '@/components/leaderboard/LeaderboardView';
import { Footer } from '@/components/layout/Footer';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { Skeleton } from '@/components/ui/Skeleton';

export const metadata: Metadata = { title: 'Leaderboard' };

export default function LeaderboardPage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        {/* useSearchParams (the ?page= value) needs a Suspense boundary for static rendering */}
        <Suspense fallback={<div className="mx-auto max-w-4xl px-4 py-14 sm:px-6"><Skeleton className="h-72 w-full" /></div>}>
          <LeaderboardView />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
