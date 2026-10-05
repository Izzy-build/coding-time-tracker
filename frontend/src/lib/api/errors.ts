export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'parse';

export interface FieldDetail {
  path: string;
  message: string;
}

/**
 * Every failure of an API call. `message` is always safe to show to a user: it is either a known
 * backend message or a generic one, never a stack trace, URL, token or raw response body.
 */
export class ApiError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: FieldDetail[] = [],
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static network() {
    return new ApiError('network', 0, 'NETWORK_ERROR', "Can't reach the server. Check your connection and try again.");
  }
  static timeout() {
    return new ApiError('timeout', 0, 'TIMEOUT', 'The server took too long to respond. Please try again.');
  }
  static parse(status: number) {
    return new ApiError('parse', status, 'BAD_RESPONSE', 'The server sent an unexpected response. Please try again.');
  }
}

/** Codes that mean "the website JWT is no good" (as opposed to a CLI-token or credential problem). */
const SESSION_CODES = new Set(['TOKEN_EXPIRED', 'INVALID_TOKEN', 'UNAUTHORIZED']);

export function isSessionFailure(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401 && SESSION_CODES.has(error.code);
}

const FRIENDLY: Record<string, string> = {
  INVALID_CREDENTIALS: 'Incorrect email or password.',
  USERNAME_TAKEN: 'That username is already taken. Try a different one.',
  TOKEN_EXPIRED: 'Your session has expired. Please sign in again.',
  INVALID_TOKEN: 'Your session is no longer valid. Please sign in again.',
  UNAUTHORIZED: 'Please sign in to continue.',
  TOKEN_ALREADY_EXISTS: 'You already have a CLI token.',
  VALIDATION_ERROR: 'Please check the highlighted fields and try again.',
};

/** Human-readable message for any thrown value. */
export function toUserMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  if (error.status === 429 || error.code === 'RATE_LIMITED') {
    const wait = error.retryAfterSeconds;
    return wait && wait > 0
      ? `Too many requests. Please wait about ${wait > 60 ? `${Math.ceil(wait / 60)} minutes` : `${wait} seconds`} and try again.`
      : 'Too many requests. Please wait a moment and try again.';
  }
  if (error.status >= 500) return 'Something went wrong on our side. Please try again in a moment.';
  return FRIENDLY[error.code] ?? error.message;
}

/** Backend validation details -> `{ email: "...", password: "..." }` (first message per field). */
export function toFieldErrors(error: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
    for (const d of error.details) {
      const field = d.path.split('.')[0];
      if (field && !(field in out)) out[field] = d.message;
    }
  }
  return out;
}
