import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { codingStats } from '../../src/db/schema.js';
import {
  createTestContext,
  createUserWithToken,
  fetchToken,
  profile,
  report,
  validate,
  type TestContext,
} from '../helpers/app.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

const totalOf = async (userId: string) =>
  (await ctx.db.select().from(codingStats).where(eq(codingStats.userId, userId)))[0]?.totalSeconds;

describe('GET /validate/:token', () => {
  it('14. a valid token returns 200 { message: "User exists" }', async () => {
    const u = await createUserWithToken(ctx.app, 'alice');
    const res = await validate(ctx.app, u.cli);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ message: 'User exists' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).not.toContain(u.cli);
  });

  it('15. unknown, malformed and empty-ish tokens return 401 { message: "User does not exist" }', async () => {
    for (const token of [`ctt_${'x'.repeat(21)}`, `ctt_${'x'.repeat(43)}`, 'ctt_short', 'not-a-token', 'ctt_', 'a'.repeat(150), 'a'.repeat(400), "ctt_'; DROP TABLE users;--"]) {
      const res = await validate(ctx.app, encodeURIComponent(token));
      expect(res.statusCode, token).toBe(401);
      expect(res.json()).toEqual({ message: 'User does not exist' });
    }
  });

  it('16. a revoked token is rejected', async () => {
    const u = await createUserWithToken(ctx.app, 'bob');
    expect((await validate(ctx.app, u.cli)).statusCode).toBe(200);
    await fetchToken(ctx.app, u, 'update');
    const res = await validate(ctx.app, u.cli);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ message: 'User does not exist' });
  });
});

describe('POST /report', () => {
  it('17. the first report stores the submitted seconds', async () => {
    const u = await createUserWithToken(ctx.app, 'carol');
    const res = await report(ctx.app, u.cli, 2400);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ message: 'Time reported successfully', addedSeconds: 2400, totalSeconds: 2400 });
    expect(await totalOf(u.id)).toBe(2400);
  });

  it('18. later reports are added to the existing total (2400 -> 4400 -> 4700)', async () => {
    const u = await createUserWithToken(ctx.app, 'dave');
    await report(ctx.app, u.cli, 2400);
    const second = await report(ctx.app, u.cli, 2000);
    expect(second.json()).toEqual({ message: 'Time reported successfully', addedSeconds: 2000, totalSeconds: 4400 });
    const third = await report(ctx.app, u.cli, 300);
    expect(third.json().totalSeconds).toBe(4700);
    expect(await totalOf(u.id)).toBe(4700);
  });

  it('accepts the configured maximum and rejects one above it', async () => {
    const u = await createUserWithToken(ctx.app, 'erin');
    expect((await report(ctx.app, u.cli, 3600)).statusCode).toBe(200);
    expect((await report(ctx.app, u.cli, 3601)).statusCode).toBe(400);
    expect(await totalOf(u.id)).toBe(3600);
  });

  it.each([
    ['19. negative seconds', -300],
    ['20. zero seconds', 0],
    ['21. decimal seconds', 300.5],
    ['22. excessive seconds', 99_999_999],
    ['22. absurdly large (overflow-sized) seconds', 9e15],
    ['non-numeric string', 'abc'],
    ['numeric string', '300'],
    ['null', null],
    ['boolean', true],
    ['array', [300]],
    ['missing', undefined],
  ])('rejects %s with 400 VALIDATION_ERROR and does not change the total', async (_label, seconds) => {
    const u = await createUserWithToken(ctx.app, `rej_${Math.random().toString(36).slice(2, 8)}`);
    await report(ctx.app, u.cli, 100);
    const res = await report(ctx.app, u.cli, seconds);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(await totalOf(u.id)).toBe(100);
  });

  it('23. an invalid CLI token fails with 401 INVALID_TOKEN and credits nobody', async () => {
    const u = await createUserWithToken(ctx.app, 'frank');
    const res = await report(ctx.app, `ctt_${'z'.repeat(21)}`, 300);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: { code: 'INVALID_TOKEN', message: expect.any(String) } });
    expect(await totalOf(u.id)).toBe(0);
  });

  it('rejects a revoked token and a missing token field', async () => {
    const u = await createUserWithToken(ctx.app, 'grace');
    const old = u.cli;
    await fetchToken(ctx.app, u, 'update');
    expect((await report(ctx.app, old, 300)).statusCode).toBe(401);
    const noToken = await ctx.app.inject({ method: 'POST', url: '/api/v1/report', payload: { seconds: 300 } });
    expect(noToken.statusCode).toBe(400);
    expect(await totalOf(u.id)).toBe(0);
  });

  it('only credits the owner of the token', async () => {
    const a = await createUserWithToken(ctx.app, 'heidi');
    const b = await createUserWithToken(ctx.app, 'ivan');
    await report(ctx.app, a.cli, 500);
    expect(await totalOf(a.id)).toBe(500);
    expect(await totalOf(b.id)).toBe(0);
  });

  it('24. concurrent reports never lose updates (20 x 300s -> exactly 6000)', async () => {
    const u = await createUserWithToken(ctx.app, 'judy');
    await report(ctx.app, u.cli, 2400); // start from the 2400 example
    const results = await Promise.all(Array.from({ length: 20 }, () => report(ctx.app, u.cli, 300)));
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    // every response saw a distinct running total: no two requests read the same value
    const totals = results.map((r) => r.json().totalSeconds as number).sort((a, b) => a - b);
    expect(new Set(totals).size).toBe(20);
    expect(totals[0]).toBe(2700);
    expect(totals[19]).toBe(8400);
    expect(await totalOf(u.id)).toBe(8400);
  });

  it('concurrent FIRST reports for a user with no stats row are all counted (upsert)', async () => {
    const u = await createUserWithToken(ctx.app, 'ken');
    await ctx.pool.query('DELETE FROM coding_stats WHERE user_id = $1', [u.id]);
    const results = await Promise.all(Array.from({ length: 10 }, () => report(ctx.app, u.cli, 300)));
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    expect(await totalOf(u.id)).toBe(3000);
  });

  it('keeps the total a plain integer number of seconds', async () => {
    const u = await createUserWithToken(ctx.app, 'leo');
    await report(ctx.app, u.cli, 3200);
    const res = await report(ctx.app, u.cli, 3200);
    expect(res.statusCode).toBe(200);
    expect(Number.isInteger(res.json().totalSeconds)).toBe(true);
    expect(res.json().totalSeconds).toBe(6400); // 6400 s is stored as 6400, not 1.7777 hours
  });
});

describe('GET /profile/:token', () => {
  it('25. a valid token returns the safe profile', async () => {
    const u = await createUserWithToken(ctx.app, 'izzycipherss');
    const res = await profile(ctx.app, u.cli);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      userId: u.id,
      username: 'izzycipherss',
      name: null,
      email: u.email,
      createdAt: expect.any(String),
      totalSeconds: 0,
    });
  });

  it('includes the cumulative totalSeconds from coding_stats and tracks new reports', async () => {
    const u = await createUserWithToken(ctx.app, 'totals');
    await report(ctx.app, u.cli, 2400);
    await report(ctx.app, u.cli, 2000);
    expect((await profile(ctx.app, u.cli)).json().totalSeconds).toBe(4400);
    await report(ctx.app, u.cli, 300);
    const res = await profile(ctx.app, u.cli);
    expect(res.json().totalSeconds).toBe(4700);
    expect(Number.isInteger(res.json().totalSeconds)).toBe(true);
  });

  it('26-27. never returns the password hash, the password or any token', async () => {
    const u = await createUserWithToken(ctx.app, 'mallory');
    const res = await profile(ctx.app, u.cli);
    const [row] = (await ctx.pool.query('SELECT password_hash FROM users WHERE id = $1', [u.id])).rows as { password_hash: string }[];
    expect(res.body).not.toContain(row!.password_hash);
    expect(res.body).not.toContain(u.password);
    expect(res.body).not.toContain(u.cli);
    expect(res.body).not.toContain(u.jwt);
    expect(res.body).not.toMatch(/password|hash|token|argon2/i);
    expect(Object.keys(res.json()).sort()).toEqual(['createdAt', 'email', 'name', 'totalSeconds', 'userId', 'username']);
  });

  it('28. a revoked token cannot access the profile', async () => {
    const u = await createUserWithToken(ctx.app, 'nina');
    const old = u.cli;
    await fetchToken(ctx.app, u, 'update');
    const res = await profile(ctx.app, old);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: { code: 'INVALID_TOKEN', message: expect.any(String) } });
  });

  it('an unknown token returns 401', async () => {
    expect((await profile(ctx.app, `ctt_${'q'.repeat(21)}`)).statusCode).toBe(401);
  });
});

describe('CLI token format: early rejection (before any database work)', () => {
  const rand = (n: number) => 'aB3'.repeat(10).slice(0, n);
  const malformed: [string, string][] = [
    ['ctt_short', 'ctt_short'],
    ['ctt_ + 20 chars (24 total)', `ctt_${rand(20)}`],
    ['ctt_ + 22 chars (26 total)', `ctt_${rand(22)}`],
    ['much longer than 25', `ctt_${rand(21)}${rand(30)}`],
    ['invalid character "!"', 'ctt_abcdefghijklmnopqr!'],
    ['invalid character "!" at exact length', `ctt_${rand(20)}!`],
    ['url-safe base64 chars (_ and -) are not in the alphabet', `ctt_${rand(19)}_-`],
    ['wrong prefix, right length', `xyz_${rand(21)}`],
    ['uppercase prefix', `CTT_${rand(21)}`],
    ['no prefix', rand(25)],
    ['website-JWT-shaped string', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln'],
  ];
  const endpoints = {
    validate: (t: string) => validate(ctx.app, encodeURIComponent(t)),
    profile: (t: string) => profile(ctx.app, encodeURIComponent(t)),
    report: (t: string) => report(ctx.app, t, 300),
  };

  it.each(malformed)('%s is rejected by /validate, /report and /profile without touching PostgreSQL', async (_label, token) => {
    const spy = vi.spyOn(ctx.pool, 'query');
    try {
      const v = await endpoints.validate(token);
      expect(v.statusCode).toBe(401);
      expect(v.json()).toEqual({ message: 'User does not exist' });

      const r = await endpoints.report(token);
      expect(r.statusCode).toBe(401);
      expect(r.json().error.code).toBe('INVALID_TOKEN');

      const p = await endpoints.profile(token);
      expect(p.statusCode).toBe(401);
      expect(p.json().error.code).toBe('INVALID_TOKEN');

      expect(spy).not.toHaveBeenCalled(); // no SELECT, no UPDATE, nothing
    } finally {
      spy.mockRestore();
    }
  });

  it.each([
    ['null', null],
    ['a number', 1234567890123],
    ['an object', { token: 'ctt_x' }],
    ['an array', ['ctt_aaaaaaaaaaaaaaaaaaaaa']],
    ['a boolean', true],
  ])('/report rejects a token that is %s (not a string) with 400 and no database work', async (_label, token) => {
    const spy = vi.spyOn(ctx.pool, 'query');
    try {
      const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/report', payload: { token, seconds: 300 } });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('/report rejects a missing token with 400 and no database work', async () => {
    const spy = vi.spyOn(ctx.pool, 'query');
    try {
      const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/report', payload: { seconds: 300 } });
      expect(res.statusCode).toBe(400);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('a correctly formatted but unknown token DOES reach the database lookup, and is then rejected', async () => {
    const unknown = `ctt_${rand(21)}`;
    expect(unknown).toHaveLength(25);
    for (const [name, call] of Object.entries(endpoints)) {
      const spy = vi.spyOn(ctx.pool, 'query');
      try {
        const res = await call(unknown);
        expect(res.statusCode, name).toBe(401);
        expect(spy, `${name} must perform the hashed lookup`).toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    }
  });

  it('a valid 25-character token passes the format check and works on all three endpoints', async () => {
    const u = await createUserWithToken(ctx.app, 'formatok');
    expect(u.cli).toMatch(/^ctt_[A-Za-z0-9]{21}$/);
    expect(u.cli).toHaveLength(25);
    expect((await validate(ctx.app, u.cli)).statusCode).toBe(200);
    expect((await report(ctx.app, u.cli, 300)).statusCode).toBe(200);
    expect((await profile(ctx.app, u.cli)).statusCode).toBe(200);
  });
});
