'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { AlertIcon, CheckIcon, InfoIcon } from './icons';

type Tone = 'success' | 'info' | 'warning' | 'error';

export interface ToastInput {
  tone: Tone;
  title: string;
  message?: string | undefined;
  /** Stays until dismissed (use for things the user must not miss). */
  sticky?: boolean | undefined;
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<{ toast: (input: ToastInput) => void } | null>(null);

const tones: Record<Tone, string> = {
  success: 'border-accent/40',
  info: 'border-info/40',
  warning: 'border-warning/50',
  error: 'border-danger/50',
};
const iconTones: Record<Tone, string> = {
  success: 'text-accent',
  info: 'text-info',
  warning: 'text-warning',
  error: 'text-danger',
};

const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = ++nextId.current;
      setItems((current) => [...current.slice(-2), { ...input, id }]);
      if (!input.sticky) window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-stretch gap-2 p-4 sm:items-end"
      >
        {items.map((item) => {
          const Glyph = item.tone === 'success' ? CheckIcon : item.tone === 'info' ? InfoIcon : AlertIcon;
          return (
            <div
              key={item.id}
              className={cn(
                'pointer-events-auto flex w-full animate-fade-in gap-3 rounded-lg border bg-surface-2 px-4 py-3 shadow-xl shadow-black/40 sm:max-w-sm',
                tones[item.tone],
              )}
            >
              <Glyph className={cn('mt-0.5 size-4 shrink-0', iconTones[item.tone])} />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium text-fg">{item.title}</p>
                {item.message && <p className="mt-0.5 leading-relaxed text-muted">{item.message}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="-mr-1 -mt-1 h-7 rounded px-2 text-xs text-subtle transition-colors hover:text-fg"
                aria-label={`Dismiss notification: ${item.title}`}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside <ToastProvider>');
  return value.toast;
}
