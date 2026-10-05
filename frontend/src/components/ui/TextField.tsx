import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TextFieldProps extends Omit<ComponentProps<'input'>, 'id'> {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  /** Optional element rendered inside the right edge of the input (e.g. a show/hide button). */
  trailing?: ReactNode;
}

export function TextField({ label, error, hint, trailing, className, required, ...rest }: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
        {!required && <span className="ml-1.5 text-xs font-normal text-subtle">(optional)</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'block h-11 w-full rounded-lg border bg-bg px-3.5 text-[15px] text-fg placeholder:text-subtle',
            'transition-colors hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-60',
            error ? 'border-danger/70' : 'border-line',
            trailing ? 'pr-11' : null,
            className,
          )}
          {...rest}
        />
        {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
      </div>
      {hint && !error && (
        <p id={hintId} className="text-xs text-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
