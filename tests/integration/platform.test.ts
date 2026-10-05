import { afterAll, describe, expect, it } from 'vitest';
import {
  bearer,
  createLogCapture,
  createTestContext,
  createUserWithToken,
  fetchToken,
  profile,
  report,
  signin,
  validate,
  type TestContext,
} from '../helpers/app.js';

const contexts: TestContext[] = [];
const make = async (...args: Parameters<typeof createTestContext>) => {
  const c = await createTestContext(...args);
  contexts.push(c);
  return c;
};
afterAll(async () => {
  for (const c of contexts) await c.close();
});

describe('error format', () => {
  it('uses the standard envelope for unknown routes, malformed JSON and oversized bodies', async () => {
    const ctx = await make();
    const missing = await ctx.app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });

    const bad = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/signin',
      headers: { 'content-type': 'application/json' },
      payload: '{"email": ',
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('BAD_REQUEST');
    expect(bad.body).not.toMatch(/stack|node_modules|SyntaxError/i);

    const huge = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/signin',
      payload: { email: 'a@b.co', password: 'x'.repeat(40_000) },
    });
    expect(huge.statusCode).toBe(413);
    expect(huge.json().error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('turns unexpected failures into a generic INTERNAL_ERROR (no DB details)', async () => {
    const ctx = await make();
    const u = await createUserWithToken(ctx.app, 'victim');
    await ctx.pool.query('ALTER TABLE coding_stats RENAME TO coding_stats_tmp');
    try {
      const res = await report(ctx.app, u.cli, 300);
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
      expect(res.body).not.toMatch(/relation|coding_stats|SQL|insert|select/i);
    } finally {
      await ctx.pool.query('ALTER TABLE coding_stats_tmp RENAME TO coding_stats');
    }
  });
});

describe('removed functionality is gone', () => {
  it.each([
    ['POST', '/api/v1/sessions/start'],
    ['POST', '/api/v1/sessions/00000000-0000-4000-8000-000000000000/heartbeat'],
    ['POST', '/api/v1/sessions/00000000-0000-4000-8000-000000000000/stop'],
    ['GET', '/api/v1/sessions'],
    ['GET', '/api/v1/sessions/00000000-0000-4000-8000-000000000000'],
    ['POST', '/api/v1/tokens'],
    ['GET', '/api/v1/tokens'],
    ['DELETE', '/api/v1/tokens/00000000-0000-4000-8000-000000000000'],
    ['POST', '/api/v1/auth/login'],
    ['POST', '/api/v1/auth/signup'],
    ['POST', '/api/v1/auth/refresh'],
    ['GET', '/api/v1/me'],
    ['GET', '/api/v1/me/stats'],
  ])('%s %s returns 404', async (method, url) => {
    const ctx = contexts[0] ?? (await make());
    const res = await ctx.app.inject({ method: method as 'GET', url });
    expect(res.statusCode).toBe(404);
  });
});

describe('security hardening', () => {
  it('sets secure headers, including no-referrer (tokens live in URLs)', async () => {
    const ctx = await make();
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/leaderboard' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sends Cache-Control: no-store on every secret-bearing endpoint', async () => {
    const ctx = await make();
    const u = await createUserWithToken(ctx.app, 'cachecheck');
    const responses = [
      await signin(ctx.app, u.email, u.password),
      await ctx.app.inject({ method: 'GET', url: '/api/v1/token/update', headers: bearer(u.jwt) }),
      await validate(ctx.app, u.cli),
      await profile(ctx.app, u.cli),
      await report(ctx.app, u.cli, 60),
      await validate(ctx.app, 'ctt_bad'),
    ];
    for (const r of responses) expect(r.headers['cache-control']).toBe('no-store');
  });

  it('allows only configured CORS origins', async () => {
    const ctx = await make();
    const ok = await ctx.app.inject({ method: 'GET', url: '/api/v1/leaderboard', headers: { origin: 'http://localhost:3000' } });
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    const evil = await ctx.app.inject({ method: 'GET', url: '/api/v1/leaderboard', headers: { origin: 'https://evil.example' } });
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rate-limits /signin (brute-force protection) with the standard envelope', async () => {
    const ctx = await make({ AUTH_RATE_LIMIT_MAX: '3' });
    for (let i = 0; i < 3; i++) expect((await signin(ctx.app, 'x@example.com', 'a-very-good-password')).statusCode).toBeLessThan(429);
    const blocked = await signin(ctx.app, 'x@example.com', 'a-very-good-password');
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe('RATE_LIMITED');
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('rate-limits the CLI endpoints independently', async () => {
    const ctx = await make({ CLI_RATE_LIMIT_MAX: '5' });
    const u = await createUserWithToken(ctx.app, 'limited');
    for (let i = 0; i < 5; i++) expect((await report(ctx.app, u.cli, 10)).statusCode).toBe(200);
    const blocked = await report(ctx.app, u.cli, 10);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe('RATE_LIMITED');
  });

  it('REPORT_MAX_SECONDS is configurable', async () => {
    const ctx = await make({ REPORT_MAX_SECONDS: '600' });
    const u = await createUserWithToken(ctx.app, 'cfgmax');
    expect((await report(ctx.app, u.cli, 600)).statusCode).toBe(200);
    expect((await report(ctx.app, u.cli, 601)).statusCode).toBe(400);
  });
});

describe('logging never leaks secrets', () => {
  it('logs no passwords, JWTs, raw CLI tokens (even in URLs) or SQL parameters', async () => {
    const logs = createLogCapture();
    const ctx = await make({ LOG_LEVEL: 'info' }, { logger: true, logStream: logs.stream });
    const u = await createUserWithToken(ctx.app, 'logcheck');

    await validate(ctx.app, u.cli); //                 token in the URL
    await profile(ctx.app, u.cli); //                  token in the URL
    await report(ctx.app, u.cli, 300); //              token in the body
    await validate(ctx.app, 'ctt_not_a_real_token_but_secret_looking'); // malformed token in the URL
    await validate(ctx.app, 'ctt_Sup3rSecretValue12345'); //                  well-formed (25 chars) unknown token in the URL
    await ctx.app.inject({ method: 'GET', url: `/api/v1/nonexistent/${u.cli}` }); // token inside a 404 URL
    await signin(ctx.app, u.email, 'wrong-password-123');
    const rotated = await fetchToken(ctx.app, u, 'update');
    await validate(ctx.app, rotated);

    // An unexpected DB failure must not dump SQL parameters (emails, hashes) into the log.
    await ctx.pool.query('ALTER TABLE users RENAME TO users_tmp');
    try {
      const res = await signin(ctx.app, 'leak.me@example.com', 'another-password-456');
      expect(res.statusCode).toBe(500);
    } finally {
      await ctx.pool.query('ALTER TABLE users_tmp RENAME TO users');
    }

    const text = logs.text();
    expect(text.length).toBeGreaterThan(0); // logging really was on
    expect(text).toContain('ctt_[REDACTED]'); // the URL serializer ran
    for (const secret of [
      u.cli,
      rotated,
      u.jwt,
      u.password,
      'wrong-password-123',
      'another-password-456',
      'leak.me@example.com',
      'ctt_not_a_real_token_but_secret_looking',
      'ctt_Sup3rSecretValue12345',
      '$argon2',
    ]) {
      expect(text, `log must not contain ${secret.slice(0, 12)}...`).not.toContain(secret);
    }
  });
});

describe('OpenAPI documentation matches the final API exactly', () => {
  it('documents exactly the six final endpoints and nothing from the old design', async () => {
    const ctx = await make();
    const res = await ctx.app.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
    const spec = res.json();

    const documented = Object.entries(spec.paths as Record<string, Record<string, unknown>>)
      .flatMap(([path, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${path}`))
      .sort();
    expect(documented).toEqual(
      [
        'POST /api/v1/signin',
        'GET /api/v1/token/{action}',
        'GET /api/v1/validate/{token}',
        'POST /api/v1/report',
        'GET /api/v1/profile/{token}',
        'GET /api/v1/leaderboard',
      ].sort(),
    );
    expect(JSON.stringify(spec)).not.toMatch(/heartbeat|idle|sessions|cliBearer|refresh/i);
    expect(Object.keys(spec.components.securitySchemes)).toEqual(['webBearer']);
  });

  it('each endpoint has a description, 2xx + 4xx + 500 responses, and the right auth requirement', async () => {
    const ctx = await make();
    const spec = (await ctx.app.inject({ method: 'GET', url: '/docs/json' })).json();
    const checks: [string, string, boolean][] = [
      ['post', '/api/v1/signin', false],
      ['get', '/api/v1/token/{action}', true],
      ['get', '/api/v1/validate/{token}', false],
      ['post', '/api/v1/report', false],
      ['get', '/api/v1/profile/{token}', false],
      ['get', '/api/v1/leaderboard', false],
    ];
    for (const [method, path, usesJwt] of checks) {
      const op = spec.paths[path][method];
      expect(op.summary, path).toBeTruthy();
      expect(op.description, path).toBeTruthy();
      const codes = Object.keys(op.responses);
      expect(codes.some((c) => c.startsWith('2')), `${path} 2xx`).toBe(true);
      expect(codes.some((c) => c.startsWith('4')), `${path} 4xx`).toBe(true);
      expect(codes, `${path} 500`).toContain('500');
      if (usesJwt) expect(op.security).toEqual([{ webBearer: [] }]);
      else expect(op.security).toBeUndefined();
    }
    // request bodies, path params, and examples
    const signin = spec.paths['/api/v1/signin'].post;
    expect(signin.requestBody.content['application/json'].schema.example).toEqual({
      email: 'user@example.com',
      password: 'correct-horse-battery',
    });
    expect(Object.keys(signin.responses)).toEqual(expect.arrayContaining(['200', '201', '400', '401', '409']));
    const action = spec.paths['/api/v1/token/{action}'].get.parameters.find((p: { name: string }) => p.name === 'action');
    expect(action.in).toBe('path');
    expect(action.schema.enum).toEqual(['get', 'update']);
    const reportBody = spec.paths['/api/v1/report'].post.requestBody.content['application/json'].schema;
    expect(reportBody.properties.seconds).toMatchObject({ type: 'integer', minimum: 1, maximum: 3600 });
    expect(reportBody.example).toMatchObject({ seconds: 300 });
    expect(spec.paths['/api/v1/report'].post.responses['200'].content['application/json'].schema.example).toEqual({
      message: 'Time reported successfully',
      addedSeconds: 2000,
      totalSeconds: 4400,
    });
    const validate = spec.paths['/api/v1/validate/{token}'].get.responses;
    expect(validate['200'].content['application/json'].schema.properties.message.const ?? validate['200'].content['application/json'].schema.properties.message.enum).toBeDefined();
  });

  it('shows the 25-character token format everywhere (no old-format examples)', async () => {
    const ctx = await make();
    const spec = (await ctx.app.inject({ method: 'GET', url: '/docs/json' })).json();
    const text = JSON.stringify(spec);
    const tokens = text.match(/ctt_[A-Za-z0-9_-]+/g) ?? [];
    expect(tokens.length).toBeGreaterThan(0);
    for (const t of tokens) expect(t, `example ${t}`).toMatch(/^ctt_[A-Za-z0-9]{21}$/);
    expect(text).toContain('ctt_A7k92LmX4pQ8zN3bT6vR1');
    const profileSchema = spec.paths['/api/v1/profile/{token}'].get.responses['200'].content['application/json'].schema;
    expect(Object.keys(profileSchema.properties)).toContain('totalSeconds');
    // the website sign-in response does NOT gain totalSeconds
    const signinUser = spec.paths['/api/v1/signin'].post.responses['200'].content['application/json'].schema.properties.user;
    expect(Object.keys(signinUser.properties)).not.toContain('totalSeconds');
  });

  it('serves the Swagger UI and a health probe', async () => {
    const ctx = await make();
    expect([200, 302]).toContain((await ctx.app.inject({ method: 'GET', url: '/docs' })).statusCode);
    expect((await ctx.app.inject({ method: 'GET', url: '/health' })).json()).toEqual({ status: 'ok' });
  });
});
