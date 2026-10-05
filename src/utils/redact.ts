/**
 * CLI tokens travel in URLs (`/validate/:token`, `/profile/:token`), and Fastify's default request
 * log line includes the URL. Everything that looks like a CLI token is masked before logging.
 */
const CLI_TOKEN_PATTERN = /ctt_[A-Za-z0-9_-]+/g;

export function redactUrl(url: string): string {
  return url.replace(CLI_TOKEN_PATTERN, 'ctt_[REDACTED]');
}

/**
 * A log-safe view of an unexpected error. Drizzle error messages embed the SQL *parameters*
 * (emails, password hashes, ...), so only the message head and the PostgreSQL error code are kept.
 */
export function describeErrorForLog(err: unknown): { name: string; message: string; pgCode?: string } {
  const error = err instanceof Error ? err : new Error(String(err));
  const head = (error.message.split('\nparams:')[0] ?? '').slice(0, 300);
  let pgCode: string | undefined;
  let current: unknown = err;
  for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) {
      pgCode = code;
      break;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return { name: error.name, message: redactUrl(head), ...(pgCode ? { pgCode } : {}) };
}
