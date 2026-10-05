import Link from 'next/link';
import type { ComponentProps } from 'react';
import { buttonClasses, type ButtonSize, type ButtonVariant } from './button-styles';

interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function ButtonLink({ variant, size, className, ...rest }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...rest} />;
}
