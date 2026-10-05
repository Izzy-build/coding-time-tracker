import { randomInt } from 'node:crypto';

/**
 * CLI token contract (agreed with the CLI developer): exactly 25 characters.
 *
 *   ctt_ + 21 characters from [A-Za-z0-9]      e.g.  ctt_A7k92LmX4pQ8zN3bT6vR1
 *
 * 21 characters from a 62-symbol alphabet is ~125 bits of entropy, which is ample for a token that
 * is only ever stored as a SHA-256 hash.
 */
export const CLI_TOKEN_PREFIX = 'ctt_';
export const CLI_TOKEN_RANDOM_LENGTH = 21;
export const CLI_TOKEN_LENGTH = CLI_TOKEN_PREFIX.length + CLI_TOKEN_RANDOM_LENGTH; // 25
export const CLI_TOKEN_PATTERN = /^ctt_[A-Za-z0-9]{21}$/;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * The single, centralised format check for CLI tokens. It is pure (no I/O) and is called FIRST by
 * TokensService.resolve(), i.e. before hashing and before any database query, so malformed input
 * never costs a SHA-256 or a round trip to PostgreSQL.
 */
export function isValidCliTokenFormat(value: unknown): value is string {
  return typeof value === 'string' && value.length === CLI_TOKEN_LENGTH && CLI_TOKEN_PATTERN.test(value);
}

/**
 * Generates a CLI token. `crypto.randomInt` draws from the OS CSPRNG and uses rejection sampling,
 * so every character is uniformly distributed over the 62-symbol alphabet (no modulo bias).
 */
export function generateCliToken(): string {
  let random = '';
  for (let i = 0; i < CLI_TOKEN_RANDOM_LENGTH; i++) {
    random += ALPHABET.charAt(randomInt(ALPHABET.length));
  }
  return `${CLI_TOKEN_PREFIX}${random}`;
}
