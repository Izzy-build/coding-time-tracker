import type { ComponentProps } from 'react';
import { buttonClasses, type ButtonSize, type ButtonVariant } from './button-styles';
import { Spinner } from './Spinner';

interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button (it stays focusable-safe: `aria-busy`). */
  loading?: boolean;
}

export function Button({ variant, size, loading = false, disabled, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
