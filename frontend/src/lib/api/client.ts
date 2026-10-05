import type { z } from 'zod';
import { API_BASE, API_PREFIX, REQUEST_TIMEOUT_MS } from '@/lib/config';
import { ApiError, isSessionFailure, type FieldDetail } from './errors';
import { errorEnvelopeSchema } from './schemas';

/**
 * The single place that talks to the backend. Responsibilities:
 *  - build the URL (same-origin proxy by default, see lib/config)
 *  - attach the website JWT when given
 *  - never log anything (URLs may contain CLI tokens, headers contain the JWT)
 *  - turn every failure into an `ApiError` with a user-safe message
 *  - validate successful responses against a Zod schema
 *  - notify the app when the JWT is rejected so it can sign the user out exactly once
 */

type SessionHandler = (error: ApiError) => void;
let sessionHandler: SessionHandler | null = null;

export function setSessionFailureHandler(handler: SessionHandler | null): void {
  sessionHandler = handler;
}

export interface ApiRequest<S extends z.ZodType> {
  path: string;
  schema: S;
  method?: 'GET' | 'POST';
  /** Website JWT. Only requests that send one can trigger the session-failure handler. */
  jwt?: string;
  body?: unknown;
  signal?: AbortSignal;
}

export interface ApiResult<T> {
  status: number;
  data: T;
}

function retryAfter(response: Response): number | undefined {
  const raw = response.headers.get('retry-after');
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function toHttpError(response: Response, body: unknown): ApiError {
  const envelope = errorEnvelopeSchema.safeParse(body);
  if (envelope.success) {
    const { code, message, details } = envelope.data.error;
    const fieldDetails: FieldDetail[] = (details ?? []).map((d) => ({ path: d.path, message: d.message }));
    return new ApiError('http', response.status, code, message, fieldDetails, retryAfter(response));
  }
  return new ApiError(
    'http',
    response.status,
    response.status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR',
    response.status >= 500 ? 'Something went wrong on our side.' : 'The request could not be completed.',
    [],
    retryAfter(response),
  );
}

export async function apiRequest<S extends z.ZodType>(req: ApiRequest<S>): Promise<ApiResult<z.output<S>>> {
  const method = req.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (req.body !== undefined) headers['Content-Type'] = 'application/json';
  if (req.jwt) headers['Authorization'] = `Bearer ${req.jwt}`;

  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${API_PREFIX}${req.path}`, {
      method,
      headers,
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal,
    });
  } catch (cause) {
    if (req.signal?.aborted) throw cause; // the caller cancelled (e.g. unmounted): not an API failure
    throw timeout.aborted ? ApiError.timeout() : ApiError.network();
  }

  const body = await readJson(response);

  if (!response.ok) {
    const error = toHttpError(response, body);
    if (req.jwt && isSessionFailure(error)) sessionHandler?.(error);
    throw error;
  }

  const parsed = req.schema.safeParse(body);
  if (!parsed.success) throw ApiError.parse(response.status);
  return { status: response.status, data: parsed.data };
}
