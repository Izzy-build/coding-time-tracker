'use client';

import { Button } from '@/components/ui/Button';

/** Last-resort boundary: shows a generic message only (never error details). */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center px-6 text-center">
      <p className="font-mono text-sm text-danger">Something broke</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">An unexpected error occurred</h1>
      <p className="mt-3 text-muted">Please try again. If the problem continues, reload the page.</p>
      <Button variant="secondary" className="mt-8" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
