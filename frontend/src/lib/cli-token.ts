/** CLI token contract: exactly 25 characters, `ctt_` + 21 letters/digits. */
export const CLI_TOKEN_PATTERN = /^ctt_[A-Za-z0-9]{21}$/;
export const CLI_TOKEN_LENGTH = 25;

export function isCliToken(value: unknown): value is string {
  return typeof value === 'string' && CLI_TOKEN_PATTERN.test(value);
}

/** `ctt_` followed by 21 bullets: same length as the real token, reveals nothing. */
export function maskCliToken(): string {
  return `ctt_${'•'.repeat(CLI_TOKEN_LENGTH - 4)}`;
}
