import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-strong active:bg-accent-strong',
  secondary: 'border border-line-strong bg-surface-2 text-fg hover:border-subtle hover:bg-[#1b2431]',
  ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
  danger: 'border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-sm',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-6 text-base',
};

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra?: string): string {
  return cn(
    'inline-flex shrink-0 select-none items-center justify-center rounded-lg font-medium whitespace-nowrap',
    'transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    sizes[size],
    extra,
  );
}
