import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cliTokens } from '../../src/db/schema.js';
import { sha256Hex } from '../../src/utils/crypto.js';
import {
  bearer,
  createUser,
  createTestContext,
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

const tokenRequest = (action: string, jwt?: string) =>
  ctx.app.inject({ method: 'GET', url: `/api/v1/token/${action}`, ...(jwt ? { headers: bearer(jwt) } : {}) });

describe('GET /token/get', () => {
  it('8-9. an authenticated user generates a CLI token in the ctt_ format', async () => {
    const user = await createUser(ctx.app, 'alice');
    const res = await tokenRequest('get', user.jwt);
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json())).toEqual(['token']);
    const token: string = res.json().token;
    expect(token).toHaveLength(25);
    expect(token.startsWith('ctt_')).toBe(true);
    expect(token).toMatch(/^ctt_[A-Za-z0-9]{21}$/);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('stores only the SHA-256 hash, never the raw token', async () => {
    const user = await createUser(ctx.app, 'bob');
    const token = await fetchToken(ctx.app, user);
    const rows = await ctx.db.select().from(cliTokens).where(eq(cliTokens.userId, user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe(sha256Hex(token));
    expect(rows[0]?.revokedAt).toBeNull();
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it('generates different tokens for different users', async () => {
    const a = await createUser(ctx.app, 'carol');
    const b = await createUser(ctx.app, 'dave');
    expect(await fetchToken(ctx.app, a)).not.toBe(await fetchToken(ctx.app, b));
  });

  it('returns 409 TOKEN_ALREADY_EXISTS when a token is active (the raw value cannot be shown again)', async () => {
    const user = await createUser(ctx.app, 'erin');
    const first = await fetchToken(ctx.app, user);
    const second = await tokenRequest('get', user.jwt);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('TOKEN_ALREADY_EXISTS');
    expect(second.body).not.toContain(first);
    expect((await validate(ctx.app, first)).statusCode).toBe(200); // the existing token is untouched
  });

  it('concurrent get calls produce exactly one active token', async () => {
    const user = await createUser(ctx.app, 'frank');
    const results = await Promise.all(Array.from({ length: 5 }, () => tokenRequest('get', user.jwt)));
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(results.filter((r) => r.statusCode === 409)).toHaveLength(4);
    const rows = await ctx.db.select().from(cliTokens).where(eq(cliTokens.userId, user.id));
    expect(rows).toHaveLength(1);
  });
});

describe('GET /token/update (rotation)', () => {
  it('10-12. the new token works and the old token stops working immediately everywhere', async () => {
    const user = await createUser(ctx.app, 'grace');
    const oldToken = await fetchToken(ctx.app, user, 'get');
    expect((await validate(ctx.app, oldToken)).statusCode).toBe(200);

    const newToken = await fetchToken(ctx.app, user, 'update');
    expect(newToken).toHaveLength(25);
    expect(newToken).toMatch(/^ctt_[A-Za-z0-9]{21}$/);
    expect(newToken).not.toBe(oldToken);

    // new token works on all three CLI endpoints
    expect((await validate(ctx.app, newToken)).statusCode).toBe(200);
    expect((await report(ctx.app, newToken, 60)).statusCode).toBe(200);
    expect((await profile(ctx.app, newToken)).statusCode).toBe(200);

    // old token is dead on all three
    const v = await validate(ctx.app, oldToken);
    expect(v.statusCode).toBe(401);
    expect(v.json()).toEqual({ message: 'User does not exist' });
    expect((await report(ctx.app, oldToken, 60)).statusCode).toBe(401);
    expect((await profile(ctx.app, oldToken)).statusCode).toBe(401);
  });

  it('preserves revoked history: one revoked row + one active row, hashes only', async () => {
    const user = await createUser(ctx.app, 'heidi');
    const t1 = await fetchToken(ctx.app, user, 'get');
    const t2 = await fetchToken(ctx.app, user, 'update');
    const t3 = await fetchToken(ctx.app, user, 'update');
    const rows = await ctx.db.select().from(cliTokens).where(eq(cliTokens.userId, user.id));
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.revokedAt === null)).toHaveLength(1);
    expect(rows.find((r) => r.revokedAt === null)?.tokenHash).toBe(sha256Hex(t3));
    expect(rows.find((r) => r.tokenHash === sha256Hex(t1))?.revokedAt).not.toBeNull();
    expect(rows.find((r) => r.tokenHash === sha256Hex(t2))?.revokedAt).not.toBeNull();
  });

  it('works as the first call too (no token yet) and is safe under concurrency', async () => {
    const user = await createUser(ctx.app, 'ivan');
    const results = await Promise.all(Array.from({ length: 4 }, () => tokenRequest('update', user.jwt)));
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    const rows = await ctx.db.select().from(cliTokens).where(eq(cliTokens.userId, user.id));
    expect(rows).toHaveLength(4);
    expect(rows.filter((r) => r.revokedAt === null)).toHaveLength(1);
    // exactly one of the returned tokens is the live one
    const live = await Promise.all(results.map((r) => validate(ctx.app, r.json().token)));
    expect(live.filter((r) => r.statusCode === 200)).toHaveLength(1);
  });

  it("rotation does not touch another user's token", async () => {
    const a = await createUser(ctx.app, 'judy');
    const b = await createUser(ctx.app, 'ken');
    const aToken = await fetchToken(ctx.app, a);
    const bToken = await fetchToken(ctx.app, b);
    await fetchToken(ctx.app, a, 'update');
    expect((await validate(ctx.app, bToken)).statusCode).toBe(200);
    expect((await validate(ctx.app, aToken)).statusCode).toBe(401);
  });
});

describe('token endpoint authorization and validation', () => {
  it('13. an unsupported action fails with 400 VALIDATION_ERROR', async () => {
    const user = await createUser(ctx.app, 'leo');
    for (const action of ['delete', 'list', 'revoke', 'GET', 'update2']) {
      const res = await tokenRequest(action, user.jwt);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('requires a website JWT (missing, garbage, forged)', async () => {
    expect((await tokenRequest('get')).statusCode).toBe(401);
    expect((await tokenRequest('get', 'garbage')).json().error.code).toBe('INVALID_TOKEN');
    const user = await createUser(ctx.app, 'mallory');
    const [h, p, s] = user.jwt.split('.');
    const tampered = `${h}.${p}.AAAA${s?.slice(4)}`;
    expect((await tokenRequest('get', tampered)).statusCode).toBe(401);
    const noneAlg = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${p}.`;
    expect((await tokenRequest('get', noneAlg)).statusCode).toBe(401);
  });

  it('rejects an expired JWT with TOKEN_EXPIRED', async () => {
    const user = await createUser(ctx.app, 'nina');
    const iat = Math.floor(Date.now() / 1000) - 7200;
    const expired = ctx.app.jwt.sign({ sub: user.id, typ: 'access', iat } as never, { expiresIn: 60 });
    const res = await tokenRequest('get', expired);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('TOKEN_EXPIRED');
  });

  it('a CLI token is NOT accepted as a website JWT', async () => {
    const user = await createUser(ctx.app, 'oscar');
    const cli = await fetchToken(ctx.app, user);
    for (const action of ['get', 'update']) {
      const res = await tokenRequest(action, cli);
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('INVALID_TOKEN');
    }
  });

  it('a website JWT is NOT accepted as a CLI token', async () => {
    const user = await createUser(ctx.app, 'peggy');
    await fetchToken(ctx.app, user);
    expect((await validate(ctx.app, user.jwt)).statusCode).toBe(401);
    expect((await report(ctx.app, user.jwt, 60)).statusCode).toBe(401);
    expect((await profile(ctx.app, user.jwt)).statusCode).toBe(401);
  });

  it('a JWT whose user no longer exists is rejected', async () => {
    const user = await createUser(ctx.app, 'quinn');
    await ctx.pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    expect((await tokenRequest('get', user.jwt)).statusCode).toBe(401);
  });
});
