import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cn('rounded-xl border border-line bg-surface', className)} {...rest} />;
}
