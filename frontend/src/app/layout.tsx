import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthProvider } from '@/lib/auth/auth-context';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Coding Time Tracker', template: '%s · Coding Time Tracker' },
  description:
    'Track your coding time from the command line and compete on a public leaderboard. Sign up, grab your CLI token, and start coding.',
};

export const viewport: Viewport = {
  themeColor: '#0a0d12',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg"
        >
          Skip to content
        </a>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
