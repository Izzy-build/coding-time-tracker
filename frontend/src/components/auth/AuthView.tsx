'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { setEndReason } from '@/lib/auth/end-reason';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import { AuthForm, type AuthMode } from './AuthForm';

const REASONS: Record<string, string> = {
  expired: 'Your session expired. Please sign in again.',
  invalid: 'You were signed out because your session is no longer valid. Please sign in again.',
};

export function AuthView() {
  const params = useSearchParams();
  const router = useRouter();
  const { status } = useAuth();

  const mode: AuthMode = params.get('mode') === 'signup' ? 'signup' : 'login';
  const reasonKey = params.get('reason');
  const reason = reasonKey ? REASONS[reasonKey] : undefined;

  // The page has shown (or doesn't need) the reason now; don't let it resurface on a later redirect.
  useEffect(() => {
    setEndReason(null);
  }, []);

  // The one place that sends signed-in users onward (also runs right after a successful sign-in).
  useEffect(() => {
    if (status === 'authenticated') router.replace('/dashboard');
  }, [status, router]);

  if (status === 'authenticated') {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-muted" role="status">
        <Spinner /> Taking you to your dashboard…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md animate-fade-in">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {mode === 'signup' ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {mode === 'signup'
            ? 'Get a CLI token and start tracking your coding time.'
            : 'Sign in to see your coding time and manage your CLI token.'}
        </p>
      </div>

      {reason && (
        <Alert tone="warning" className="mb-4">
          {reason}
        </Alert>
      )}

      <Card className="p-6 sm:p-8">
        <nav aria-label="Authentication mode" className="mb-6 grid grid-cols-2 gap-1 rounded-lg border border-line bg-bg p-1 text-sm">
          {(['login', 'signup'] as const).map((m) => (
            <Link
              key={m}
              href={`/auth?mode=${m}`}
              replace
              aria-current={mode === m ? 'page' : undefined}
              className={cn(
                'rounded-md py-2 text-center font-medium transition-colors',
                mode === m ? 'bg-surface-2 text-fg shadow-sm' : 'text-muted hover:text-fg',
              )}
            >
              {m === 'login' ? 'Sign in' : 'Create account'}
            </Link>
          ))}
        </nav>
        {/* key: switching mode remounts the form, so errors and typed values never leak between modes */}
        <AuthForm key={mode} mode={mode} />
      </Card>

      <p className="mt-6 text-center text-xs leading-relaxed text-subtle">
        Your password is only ever sent to our sign-in endpoint and is never stored in your browser.
      </p>
    </div>
  );
}
