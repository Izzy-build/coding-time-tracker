import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { codingStats, users } from '../../src/db/schema.js';
import { createTestContext, signin, type TestContext } from '../helpers/app.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

const PASSWORD = 'correct-horse-battery';

describe('POST /signin — new user', () => {
  it('1-3. creates the account, returns 201 with a JWT and safe user info', async () => {
    const res = await signin(ctx.app, 'Ada@Example.com', PASSWORD, { username: 'ada_lovelace', name: 'Ada' });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.token.split('.')).toHaveLength(3); // a JWT
    expect(body).toMatchObject({ tokenType: 'Bearer', expiresIn: 604800 });
    expect(body.user).toEqual({
      userId: expect.any(String),
      username: 'ada_lovelace',
      name: 'Ada',
      email: 'ada@example.com', // normalised
      createdAt: expect.any(String),
    });

    const [row] = await ctx.db.select().from(users).where(eq(users.email, 'ada@example.com'));
    expect(row).toBeDefined();
    // Argon2id hash, never the plaintext, never returned
    expect(row?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(res.body).not.toContain(row!.passwordHash);
    expect(res.body).not.toContain(PASSWORD);
    expect(res.body).not.toContain('passwordHash');
  });

  it('creates the initial coding-time record (0 seconds) with the user', async () => {
    const [user] = await ctx.db.select().from(users).where(eq(users.email, 'ada@example.com'));
    const [stats] = await ctx.db.select().from(codingStats).where(eq(codingStats.userId, user!.id));
    expect(stats?.totalSeconds).toBe(0);
  });

  it('the JWT contains only minimal claims (sub, typ, iss, iat, exp)', async () => {
    const res = await signin(ctx.app, 'claims@example.com', PASSWORD);
    const payload = ctx.app.jwt.decode<Record<string, unknown>>(res.json().token)!;
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'iss', 'sub', 'typ']);
    expect(payload).toMatchObject({ typ: 'access', iss: 'coding-time-tracker', sub: res.json().user.userId });
    expect((payload.exp as number) - (payload.iat as number)).toBe(604800);
  });

  it('generates a neutral public username when none is given (the email is never leaked)', async () => {
    const res = await signin(ctx.app, 'private.person@example.com', PASSWORD);
    expect(res.statusCode).toBe(201);
    expect(res.json().user.username).toMatch(/^user_[0-9a-f]{8}$/);
    expect(res.json().user.name).toBeNull();
  });

  it('rejects a username that is already taken (case-insensitive) with 409 and creates nothing', async () => {
    const res = await signin(ctx.app, 'other@example.com', PASSWORD, { username: 'ADA_Lovelace' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: { code: 'USERNAME_TAKEN', message: expect.any(String) } });
    expect(await ctx.db.select().from(users).where(eq(users.email, 'other@example.com'))).toHaveLength(0);
  });

  it('two concurrent first sign-ins for one email create ONE user and both succeed', async () => {
    const [a, b] = await Promise.all([
      signin(ctx.app, 'race@example.com', PASSWORD),
      signin(ctx.app, 'race@example.com', PASSWORD),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    expect(await ctx.db.select().from(users).where(eq(users.email, 'race@example.com'))).toHaveLength(1);
  });
});

describe('POST /signin — existing user', () => {
  it('4-5. logs in with the correct password (email case-insensitive) and returns 200', async () => {
    const res = await signin(ctx.app, 'ADA@example.com', PASSWORD);
    expect(res.statusCode).toBe(200);
    expect(res.json().user.username).toBe('ada_lovelace');
    expect(res.json().token.split('.')).toHaveLength(3);
  });

  it('login does not create a second account or change the profile', async () => {
    const before = await ctx.db.select().from(users).where(eq(users.email, 'ada@example.com'));
    const res = await signin(ctx.app, 'ada@example.com', PASSWORD, { username: 'hijack_name', name: 'Hijack' });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ username: 'ada_lovelace', name: 'Ada' });
    const after = await ctx.db.select().from(users).where(eq(users.email, 'ada@example.com'));
    expect(after).toHaveLength(1);
    expect(after[0]?.passwordHash).toBe(before[0]?.passwordHash);
  });

  it('6. rejects an incorrect password with 401 INVALID_CREDENTIALS and no token', async () => {
    const res = await signin(ctx.app, 'ada@example.com', 'definitely-wrong-password');
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: { code: 'INVALID_CREDENTIALS', message: expect.any(String) } });
    expect(res.body).not.toContain('token');
  });
});

describe('POST /signin — input validation', () => {
  it.each([
    ['missing email', { password: PASSWORD }],
    ['missing password', { email: 'v@example.com' }],
    ['invalid email', { email: 'not-an-email', password: PASSWORD }],
    ['short password', { email: 'v@example.com', password: 'short' }],
    ['over-long password', { email: 'v@example.com', password: 'x'.repeat(129) }],
    ['bad username characters', { email: 'v@example.com', password: PASSWORD, username: 'bad name!' }],
    ['non-string password', { email: 'v@example.com', password: 12345678901 }],
    ['empty body', {}],
  ])('7. returns 400 VALIDATION_ERROR for %s', async (_label, payload) => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/signin', payload });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(res.json().error.details.length).toBeGreaterThan(0);
    expect(res.body).not.toMatch(/stack|node_modules/i);
  });
});
