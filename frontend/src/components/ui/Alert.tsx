import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { AlertIcon, CheckIcon, InfoIcon } from './icons';

type Tone = 'error' | 'success' | 'info' | 'warning';

const tones: Record<Tone, string> = {
  error: 'border-danger/40 bg-danger/10 text-red-200',
  success: 'border-accent/40 bg-accent/10 text-emerald-100',
  info: 'border-info/40 bg-info/10 text-sky-100',
  warning: 'border-warning/40 bg-warning/10 text-amber-100',
};

export function Alert({ tone = 'info', title, children, className }: { tone?: Tone; title?: string; children?: ReactNode; className?: string }) {
  const Glyph = tone === 'success' ? CheckIcon : tone === 'info' ? InfoIcon : AlertIcon;
  return (
    // Errors are announced immediately; the rest politely.
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg border px-4 py-3 text-sm', tones[tone], className)}>
      <Glyph className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="leading-relaxed opacity-90">{children}</div>}
      </div>
    </div>
  );
}
