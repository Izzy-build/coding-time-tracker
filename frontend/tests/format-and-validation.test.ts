import { describe, expect, it } from 'vitest';
import { CLI_TOKEN_PATTERN, isCliToken, maskCliToken } from '@/lib/cli-token';
import { formatDate, formatDuration, formatHours, formatNumber } from '@/lib/format';
import { loginSchema, signupSchema } from '@/lib/validation';

describe('formatDuration (matches the backend formattedTime)', () => {
  it.each([
    [0, '0s'],
    [42, '42s'],
    [300, '5m'],
    [3599, '59m'],
    [3600, '1h 0m'],
    [4700, '1h 18m'],
    [6400, '1h 46m'],
    [-5, '0s'],
  ])('%i -> %s', (seconds, expected) => expect(formatDuration(seconds)).toBe(expected));

  it('formats hours and numbers for display only', () => {
    expect(formatHours(6400)).toBe('1.78');
    expect(formatHours(300)).toBe('0.08');
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('formats dates and tolerates garbage', () => {
    expect(formatDate('2026-10-01T09:30:00.000Z')).toBe('October 1, 2026');
    expect(formatDate('not a date')).toBe('—');
  });
});

describe('CLI token helpers', () => {
  it('accepts exactly ctt_ + 21 alphanumerics', () => {
    expect(isCliToken('ctt_A7k92LmX4pQ8zN3bT6vR1')).toBe(true);
    expect(CLI_TOKEN_PATTERN.test('ctt_A7k92LmX4pQ8zN3bT6vR1')).toBe(true);
  });
  it.each(['', 'ctt_short', `ctt_${'a'.repeat(20)}`, `ctt_${'a'.repeat(22)}`, `ctt_${'a'.repeat(20)}!`, `xyz_${'a'.repeat(21)}`, null, undefined, 42])(
    'rejects %j',
    (value) => expect(isCliToken(value)).toBe(false),
  );
  it('the mask is token-shaped but reveals nothing', () => {
    const mask = maskCliToken();
    expect(mask).toHaveLength(25);
    expect(mask.startsWith('ctt_')).toBe(true);
    expect(mask.slice(4)).toBe('•'.repeat(21));
  });
});

describe('form validation mirrors the backend rules', () => {
  const ok = { email: '  Ada@Example.COM ', password: 'correct-horse-battery', username: 'ada_lovelace', name: '  Ada  ' };

  it('normalises a valid sign-up', () => {
    const parsed = signupSchema.parse(ok);
    expect(parsed).toEqual({ email: 'ada@example.com', password: 'correct-horse-battery', username: 'ada_lovelace', name: 'Ada' });
  });
  it('treats a blank name as absent', () => {
    expect(signupSchema.parse({ ...ok, name: '   ' }).name).toBeUndefined();
  });
  it.each([
    ['empty email', { email: '' }, 'email'],
    ['bad email', { email: 'nope' }, 'email'],
    ['short password', { password: 'short' }, 'password'],
    ['129-char password', { password: 'x'.repeat(129) }, 'password'],
    ['short username', { username: 'ab' }, 'username'],
    ['username with a space', { username: 'bad name' }, 'username'],
    ['33-char username', { username: 'a'.repeat(33) }, 'username'],
    ['101-char name', { name: 'n'.repeat(101) }, 'name'],
  ])('rejects %s', (_label, override, field) => {
    const result = signupSchema.safeParse({ ...ok, ...override });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((i) => i.path[0])).toContain(field);
  });
  it('login needs only email and password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'a-long-enough-pw' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(false);
  });
});
