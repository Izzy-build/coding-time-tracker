'use client';

import Link from 'next/link';
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { signin, type SigninInput } from '@/lib/api/auth';
import { ApiError, toFieldErrors, toUserMessage } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/auth-context';
import { setFlash } from '@/lib/flash';
import { LIMITS } from '@/lib/config';
import { loginSchema, signupSchema } from '@/lib/validation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { EyeIcon, EyeOffIcon } from '@/components/ui/icons';
import { TextField } from '@/components/ui/TextField';

export type AuthMode = 'login' | 'signup';
type Field = 'email' | 'username' | 'name' | 'password';
type FieldErrors = Partial<Record<Field, string>>;

const FIELDS: readonly Field[] = ['email', 'username', 'name', 'password'];

export function AuthForm({ mode }: { mode: AuthMode }) {
  const { signIn } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Record<Field, string>>({ email: '', username: '', name: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isSignup = mode === 'signup';

  const onChange = (field: Field) => (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };

  const focusFirstInvalid = () =>
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());

  function validate(): SigninInput | null {
    const parsed = isSignup ? signupSchema.safeParse(values) : loginSchema.safeParse(values);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && (FIELDS as readonly string[]).includes(field) && !next[field as Field]) {
          next[field as Field] = issue.message;
        }
      }
      setErrors(next);
      setFormError(null);
      focusFirstInvalid();
      return null;
    }
    return parsed.data;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const input = validate();
    if (!input) return;

    setSubmitting(true);
    setFormError(null);
    try {
      const { created, response } = await signin(input);
      announce(mode, created, response.user.username, response.user.email);
      // Storing the session flips auth status; the page then redirects to the dashboard (single redirect path).
      signIn(response);
    } catch (error) {
      setSubmitting(false);
      handleError(error);
    }
  }

  function handleError(error: unknown) {
    if (error instanceof ApiError && error.code === 'INVALID_CREDENTIALS') {
      setFormError(
        isSignup
          ? "An account with this email may already exist, and that isn't its password. Try signing in instead."
          : 'Incorrect email or password.',
      );
      return;
    }
    if (error instanceof ApiError && error.code === 'USERNAME_TAKEN') {
      setErrors({ username: toUserMessage(error) });
      focusFirstInvalid();
      return;
    }
    if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
      // Show which fields the server objected to, with our own wording (never raw validator text).
      const next: FieldErrors = {};
      for (const field of Object.keys(toFieldErrors(error))) {
        if ((FIELDS as readonly string[]).includes(field)) next[field as Field] = 'Please check this field.';
      }
      setErrors(next);
      setFormError(toUserMessage(error));
      focusFirstInvalid();
      return;
    }
    setFormError(toUserMessage(error));
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-5" aria-describedby={formError ? 'auth-form-error' : undefined}>
      {formError && (
        <div id="auth-form-error">
          <Alert tone="error">{formError}</Alert>
        </div>
      )}

      <TextField
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        required
        value={values.email}
        onChange={onChange('email')}
        error={errors.email}
        disabled={submitting}
      />

      {isSignup && (
        <>
          <TextField
            label="Username"
            name="username"
            autoComplete="username"
            placeholder="your_handle"
            required
            maxLength={LIMITS.usernameMax}
            value={values.username}
            onChange={onChange('username')}
            error={errors.username}
            hint="Shown publicly on the leaderboard. Letters, numbers, “_” and “-”."
            disabled={submitting}
          />
          <TextField
            label="Name"
            name="name"
            autoComplete="name"
            placeholder="Ada Lovelace"
            maxLength={LIMITS.nameMax}
            value={values.name}
            onChange={onChange('name')}
            error={errors.name}
            disabled={submitting}
          />
        </>
      )}

      <TextField
        label="Password"
        name="password"
        type={showPassword ? 'text' : 'password'}
        autoComplete={isSignup ? 'new-password' : 'current-password'}
        required
        maxLength={LIMITS.passwordMax}
        value={values.password}
        onChange={onChange('password')}
        error={errors.password}
        hint={isSignup ? `At least ${LIMITS.passwordMin} characters.` : undefined}
        disabled={submitting}
        trailing={
          <button
            type="button"
            onClick={() => setShowPassword((shown) => !shown)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            className="flex size-9 items-center justify-center rounded-md text-subtle transition-colors hover:text-fg"
          >
            {showPassword ? <EyeOffIcon className="size-[18px]" /> : <EyeIcon className="size-[18px]" />}
          </button>
        }
      />

      <Button type="submit" size="lg" loading={submitting} className="w-full">
        {submitting ? (isSignup ? 'Creating account…' : 'Signing in…') : isSignup ? 'Create account' : 'Sign in'}
      </Button>

      <p className="text-center text-sm text-muted">
        {isSignup ? (
          <>
            Already have an account?{' '}
            <Link href="/auth?mode=login" className="font-medium text-accent underline-offset-4 hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{' '}
            <Link href="/auth?mode=signup" className="font-medium text-accent underline-offset-4 hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}

/**
 * /signin both logs in AND creates accounts. Tell the user what actually happened, especially when
 * "Sign in" ended up creating an account (usually a mistyped email).
 */
function announce(mode: AuthMode, created: boolean, username: string, email: string) {
  if (mode === 'signup' && created) {
    setFlash({ tone: 'success', title: 'Account created', message: `Welcome, ${username}.` });
  } else if (mode === 'signup' && !created) {
    setFlash({ tone: 'info', title: 'You already had an account', message: 'We signed you in to your existing account.' });
  } else if (mode === 'login' && created) {
    setFlash({
      tone: 'warning',
      sticky: true,
      title: 'We created a new account',
      message: `No account existed for ${email}, so one was created (username: ${username}). If that email was a typo, sign out and sign in with the correct one.`,
    });
  }
}
