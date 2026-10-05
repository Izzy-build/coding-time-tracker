import { z } from 'zod';
import { LIMITS } from '@/lib/config';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Enter your email address.')
  .max(LIMITS.emailMax, 'That email address is too long.')
  .pipe(z.email('Enter a valid email address.'));

const password = z
  .string()
  .min(LIMITS.passwordMin, `Use at least ${LIMITS.passwordMin} characters.`)
  .max(LIMITS.passwordMax, `Use at most ${LIMITS.passwordMax} characters.`);

const username = z
  .string()
  .trim()
  .min(LIMITS.usernameMin, `Use at least ${LIMITS.usernameMin} characters.`)
  .max(LIMITS.usernameMax, `Use at most ${LIMITS.usernameMax} characters.`)
  .regex(/^[A-Za-z0-9_-]+$/, 'Only letters, numbers, "_" and "-" are allowed.');

const name = z
  .string()
  .trim()
  .max(LIMITS.nameMax, `Use at most ${LIMITS.nameMax} characters.`)
  .transform((value) => (value === '' ? undefined : value));

export const loginSchema = z.object({ email, password });
export const signupSchema = z.object({ email, password, username, name });

export type LoginInput = z.output<typeof loginSchema>;
export type SignupInput = z.output<typeof signupSchema>;
