import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { z } from 'zod';
import { apiRequest, setSessionFailureHandler } from '@/lib/api/client';
import { ApiError, isSessionFailure, toFieldErrors, toUserMessage } from '@/lib/api/errors';
import { findStanding } from '@/lib/api/leaderboard';

const schema = z.object({ ok: z.boolean() });

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
}
const envelope = (code: string, message = 'm', details?: { path: string; message: string }[]) => ({
  error: { code, message, ...(details ? { details } : {}) },
});

let fetchMock: Mock<(...args: unknown[]) => Promise<Response>>;
beforeEach(() => {
  fetchMock = vi.fn<(...args: unknown[]) => Promise<Response>>();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setSessionFailureHandler(null);
});

describe('apiRequest', () => {
  it('returns parsed data and the HTTP status, with safe fetch options', async () => {
    fetchMock.mockResolvedValue(respond(201, { ok: true }));
    const result = await apiRequest({ path: '/signin', method: 'POST', schema, body: { a: 1 }, jwt: 'jwt-value' });
    expect(result).toEqual({ status: 201, data: { ok: true } });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('/api/v1/signin'); // same-origin proxy by default
    expect(init).toMatchObject({ method: 'POST', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    expect(init.headers).toMatchObject({ Authorization: 'Bearer jwt-value', 'Content-Type': 'application/json' });
    expect(init.body).toBe('{"a":1}');
  });

  it('sends no Authorization header without a JWT', async () => {
    fetchMock.mockResolvedValue(respond(200, { ok: true }));
    await apiRequest({ path: '/leaderboard', schema });
    expect((fetchMock.mock.calls[0]?.[1] as { headers: Record<string, string> }).headers).not.toHaveProperty('Authorization');
  });

  it('maps the backend error envelope to an ApiError', async () => {
    fetchMock.mockResolvedValue(respond(401, envelope('INVALID_CREDENTIALS', 'Incorrect email or password.')));
    const error = await apiRequest({ path: '/signin', method: 'POST', schema, body: {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'http', status: 401, code: 'INVALID_CREDENTIALS' });
    expect(toUserMessage(error)).toBe('Incorrect email or password.');
  });

  it('a rejected JWT notifies the session handler; a 401 without a JWT does not', async () => {
    const handler = vi.fn();
    setSessionFailureHandler(handler);

    fetchMock.mockResolvedValueOnce(respond(401, envelope('TOKEN_EXPIRED')));
    await expect(apiRequest({ path: '/token/get', schema, jwt: 'j' })).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(respond(401, envelope('INVALID_TOKEN')));
    await expect(apiRequest({ path: '/profile/ctt_x', schema })).rejects.toBeInstanceOf(ApiError); // CLI-token call, no JWT
    expect(handler).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(respond(401, envelope('INVALID_CREDENTIALS')));
    await expect(apiRequest({ path: '/signin', method: 'POST', schema, body: {} })).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('a network failure becomes a friendly NETWORK_ERROR', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const error = await apiRequest({ path: '/x', schema }).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'network', code: 'NETWORK_ERROR' });
    expect(toUserMessage(error)).toBe("Can't reach the server. Check your connection and try again.");
  });

  it('a caller-cancelled request is NOT turned into an API error', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(() => {
      controller.abort();
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    });
    const error = await apiRequest({ path: '/x', schema, signal: controller.signal }).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(ApiError);
  });

  it('never exposes raw server output for 5xx or non-JSON bodies', async () => {
    fetchMock.mockResolvedValue(respond(500, '<pre>Error: ECONNREFUSED SELECT * FROM users</pre>'));
    const error = await apiRequest({ path: '/x', schema }).catch((e: unknown) => e);
    expect(toUserMessage(error)).toBe('Something went wrong on our side. Please try again in a moment.');
    expect(JSON.stringify([(error as Error).message, toUserMessage(error)])).not.toMatch(/ECONNREFUSED|SELECT/);
  });

  it('rejects a successful response whose shape is wrong', async () => {
    fetchMock.mockResolvedValue(respond(200, { unexpected: 1 }));
    const error = await apiRequest({ path: '/x', schema }).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: 'parse', code: 'BAD_RESPONSE' });
  });

  it('429 carries Retry-After into the message', async () => {
    fetchMock.mockResolvedValue(respond(429, envelope('RATE_LIMITED'), { 'retry-after': '30' }));
    const error = await apiRequest({ path: '/x', schema }).catch((e: unknown) => e);
    expect(toUserMessage(error)).toContain('30 seconds');
  });

  it('does not write anything to the console (URLs and headers can hold secrets)', async () => {
    const spies = (['log', 'debug', 'info', 'warn', 'error'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    fetchMock.mockResolvedValue(respond(401, envelope('TOKEN_EXPIRED')));
    await apiRequest({ path: '/profile/ctt_A7k92LmX4pQ8zN3bT6vR1', schema, jwt: 'secret-jwt' }).catch(() => undefined);
    fetchMock.mockRejectedValue(new TypeError('x'));
    await apiRequest({ path: '/profile/ctt_A7k92LmX4pQ8zN3bT6vR1', schema }).catch(() => undefined);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe('error helpers', () => {
  it('only a 401 with a session code counts as a session failure', () => {
    expect(isSessionFailure(new ApiError('http', 401, 'TOKEN_EXPIRED', 'x'))).toBe(true);
    expect(isSessionFailure(new ApiError('http', 401, 'INVALID_CREDENTIALS', 'x'))).toBe(false);
    expect(isSessionFailure(new ApiError('http', 403, 'INVALID_TOKEN', 'x'))).toBe(false);
    expect(isSessionFailure(new Error('x'))).toBe(false);
  });
  it('field errors come from VALIDATION_ERROR details only', () => {
    const e = new ApiError('http', 400, 'VALIDATION_ERROR', 'm', [
      { path: 'email', message: 'bad' },
      { path: 'password', message: 'worse' },
      { path: 'email', message: 'second' },
    ]);
    expect(toFieldErrors(e)).toEqual({ email: 'bad', password: 'worse' });
    expect(toFieldErrors(new ApiError('http', 409, 'USERNAME_TAKEN', 'm'))).toEqual({});
    expect(toFieldErrors(new Error('x'))).toEqual({});
  });
  it('unknown errors get a generic message', () => {
    expect(toUserMessage(new Error('internal detail'))).toBe('Something went wrong. Please try again.');
    expect(toUserMessage('weird')).toBe('Something went wrong. Please try again.');
  });
});

describe('findStanding (leaderboard fallback)', () => {
  const entry = (rank: number, username: string, totalSeconds: number) => ({ rank, username, totalSeconds, formattedTime: `${totalSeconds}s` });
  const page = (data: ReturnType<typeof entry>[], pageNo: number, totalPages: number) =>
    respond(200, { data, pagination: { page: pageNo, pageSize: 100, total: 250, totalPages } });

  it('finds the user on a later page (case-insensitive) and stops scanning', async () => {
    fetchMock
      .mockResolvedValueOnce(page([entry(1, 'a', 9)], 1, 3))
      .mockResolvedValueOnce(page([entry(2, 'Izzy_Test', 5)], 2, 3));
    expect(await findStanding('izzy_test')).toEqual({ kind: 'found', entry: entry(2, 'Izzy_Test', 5) });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/leaderboard?page=1&pageSize=100');
  });

  it('is "absent" (total 0) once the whole board has been scanned without a match', async () => {
    fetchMock.mockResolvedValueOnce(page([entry(1, 'a', 9)], 1, 2)).mockResolvedValueOnce(page([entry(2, 'b', 8)], 2, 2));
    expect(await findStanding('nobody')).toEqual({ kind: 'absent' });
  });

  it('is "unknown" when the page cap is hit before the end of a long board', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(page([entry(1, 'a', 9)], 1, 50)));
    expect(await findStanding('nobody', undefined, 3)).toEqual({ kind: 'unknown' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
