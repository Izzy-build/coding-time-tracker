import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthView } from '@/components/auth/AuthView';
import { Footer } from '@/components/layout/Footer';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { Skeleton } from '@/components/ui/Skeleton';

export const metadata: Metadata = { title: 'Sign in' };

export default function AuthPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        {/* useSearchParams needs a Suspense boundary for static rendering */}
        <Suspense fallback={<Skeleton className="mx-auto h-[28rem] w-full max-w-md" />}>
          <AuthView />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
