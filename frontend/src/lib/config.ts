/**
 * Where the browser sends API requests.
 *  - NEXT_PUBLIC_API_URL empty (default): same-origin `/api/v1/*`, proxied to the backend by Next.js.
 *  - NEXT_PUBLIC_API_URL set: the browser calls that origin directly (backend CORS must allow this app).
 * Inlined at build time. Nothing secret ever lives here.
 */
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
export const API_PREFIX = '/api/v1';
export const REQUEST_TIMEOUT_MS = 15_000;

/** Backend rules mirrored for instant form feedback (the server remains the authority). */
export const LIMITS = {
  passwordMin: 10,
  passwordMax: 128,
  usernameMin: 3,
  usernameMax: 32,
  nameMax: 100,
  emailMax: 254,
} as const;
