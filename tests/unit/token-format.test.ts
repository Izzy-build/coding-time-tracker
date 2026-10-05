import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLI_TOKEN_LENGTH,
  CLI_TOKEN_PATTERN,
  generateCliToken,
  isValidCliTokenFormat,
} from '../../src/modules/tokens/token-format.js';

afterEach(() => vi.restoreAllMocks());

describe('generateCliToken', () => {
  it('always produces exactly 25 characters: "ctt_" + 21 alphanumerics', () => {
    expect(CLI_TOKEN_LENGTH).toBe(25);
    for (let i = 0; i < 2000; i++) {
      const token = generateCliToken();
      expect(token).toHaveLength(25);
      expect(token.startsWith('ctt_')).toBe(true);
      expect(token).toMatch(/^ctt_[A-Za-z0-9]{21}$/);
      expect(CLI_TOKEN_PATTERN.test(token)).toBe(true);
    }
  });

  it('is random: 5000 tokens are all distinct and use the whole alphabet', () => {
    const seen = new Set<string>();
    const chars = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      const token = generateCliToken();
      seen.add(token);
      for (const c of token.slice(4)) chars.add(c);
    }
    expect(seen.size).toBe(5000);
    expect(chars.size).toBe(62); // all of A-Z a-z 0-9 appear (105k samples)
  });

  it('never uses Math.random()', () => {
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random must not be used for tokens');
    });
    expect(() => generateCliToken()).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('isValidCliTokenFormat', () => {
  const ok = 'ctt_A7k92LmX4pQ8zN3bT6vR1';

  it('accepts a well-formed token', () => {
    expect(ok).toHaveLength(25);
    expect(isValidCliTokenFormat(ok)).toBe(true);
    expect(isValidCliTokenFormat(`ctt_${'0'.repeat(21)}`)).toBe(true);
    expect(isValidCliTokenFormat(`ctt_${'Z'.repeat(21)}`)).toBe(true);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 25],
    ['an object', {}],
    ['an array', [ok]],
    ['a boolean', true],
    ['empty string', ''],
    ['just the prefix', 'ctt_'],
    ['ctt_short', 'ctt_short'],
    ['24 chars (ctt_ + 20)', `ctt_${'a'.repeat(20)}`],
    ['26 chars (ctt_ + 22)', `ctt_${'a'.repeat(22)}`],
    ['much longer', `${ok}${ok}`],
    ['invalid character "!"', 'ctt_abcdefghijklmnopqr!'],
    ['"!" at exact length', `ctt_${'a'.repeat(20)}!`],
    ['underscore in the random part', `ctt_${'a'.repeat(20)}_`],
    ['dash in the random part', `ctt_${'a'.repeat(20)}-`],
    ['space in the random part', `ctt_${'a'.repeat(20)} `],
    ['trailing newline (25 chars incl. \\n)', `ctt_${'a'.repeat(20)}\n`],
    ['leading space', ` ctt_${'a'.repeat(20)}`],
    ['non-ASCII letter', `ctt_${'a'.repeat(20)}é`],
    ['wrong prefix', `xyz_${'a'.repeat(21)}`],
    ['wrong-case prefix', `CTT_${'a'.repeat(21)}`],
    ['old 47-char format', 'ctt_Tq3m0v1y2nQ8l6b9Xk4Zs7Pd5Jw1Aa0Rf2Eh8Uc3Gi'],
  ])('rejects %s', (_label, value) => {
    expect(isValidCliTokenFormat(value)).toBe(false);
  });
});
