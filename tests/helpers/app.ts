import { sql } from 'drizzle-orm';
import { Writable } from 'node:stream';
import { buildApp, type App, type BuildAppOptions } from '../../src/app/build-app.js';
import { loadConfig, type AppConfig } from '../../src/config/env.js';
import type pg from 'pg';
import { createDb, type Database } from '../../src/db/client.js';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://ctt:ctt_dev_pw@localhost:5432/ctt_test';

/** Tests TRUNCATE tables, so refuse to run against anything that is not clearly a test database. */
export function assertTestDatabase(url: string): void {
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!dbName.includes('test')) {
    throw new Error(`Refusing to run tests against database "${dbName}": its name must contain "test".`);
  }
}

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    JWT_ACCESS_SECRET: 'test-only-secret-test-only-secret-0123456789',
    LOG_LEVEL: 'silent',
    ARGON2_MEMORY_KIB: '8192',
    ARGON2_TIME_COST: '1',
    RATE_LIMIT_MAX: '100000',
    AUTH_RATE_LIMIT_MAX: '100000',
    CLI_RATE_LIMIT_MAX: '100000',
    REPORT_MAX_SECONDS: '3600',
    CORS_ORIGINS: 'http://localhost:3000',
    ...overrides,
  });
}

/** A controllable server clock. Production code only ever sees `clock.now`. */
export class TestClock {
  private current: Date;
  constructor(start = '2026-10-01T10:00:00.000Z') {
    this.current = new Date(start);
  }
  now = (): Date => new Date(this.current);
  advance(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
  set(iso: string): void {
    this.current = new Date(iso);
  }
}

export interface TestContext {
  app: App;
  db: Database;
  pool: pg.Pool;
  clock: TestClock;
  close: () => Promise<void>;
}

export async function createTestContext(
  env: Record<string, string> = {},
  extra: Partial<BuildAppOptions> = {},
): Promise<TestContext> {
  assertTestDatabase(TEST_DATABASE_URL);
  const handle = createDb({ connectionString: TEST_DATABASE_URL, max: 5 });
  await handle.db.execute(
    sql`TRUNCATE TABLE coding_stats, cli_tokens, users RESTART IDENTITY CASCADE`,
  );
  const clock = new TestClock();
  const app = await buildApp({ config: testConfig(env), db: handle.db, clock: clock.now, logger: false, ...extra });
  await app.ready();
  return {
    app,
    db: handle.db,
    pool: handle.pool,
    clock,
    close: async () => {
      await app.close();
      await handle.close();
    },
  };
}

/** Captures everything the logger writes. */
export function createLogCapture(): { stream: Writable; text: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return { stream, text: () => chunks.join('') };
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

let counter = 0;

export interface TestUser {
  id: string;
  username: string;
  email: string;
  password: string;
  /** Website JWT. */
  jwt: string;
}

/** Create-or-login through the real POST /signin endpoint. */
export async function signin(app: App, email: string, password: string, extra: Record<string, unknown> = {}) {
  return app.inject({ method: 'POST', url: '/api/v1/signin', payload: { email, password, ...extra } });
}

/** Registers a new user via POST /signin. */
export async function createUser(app: App, username?: string): Promise<TestUser> {
  counter += 1;
  const name = username ?? `user_${counter}`;
  const email = `${name}@example.com`.toLowerCase();
  const password = 'a-very-good-password';
  const res = await signin(app, email, password, { username: name });
  if (res.statusCode !== 201) throw new Error(`signin(create) failed: ${res.statusCode} ${res.body}`);
  const body = res.json();
  return { id: body.user.userId, username: name, email, password, jwt: body.token };
}

/** GET /token/get (first token) or /token/update (rotation); returns the raw CLI token. */
export async function fetchToken(app: App, user: TestUser, action: 'get' | 'update' = 'get'): Promise<string> {
  const res = await app.inject({ method: 'GET', url: `/api/v1/token/${action}`, headers: bearer(user.jwt) });
  if (res.statusCode !== 200) throw new Error(`token/${action} failed: ${res.statusCode} ${res.body}`);
  return res.json().token as string;
}

export const report = (app: App, token: string, seconds: unknown) =>
  app.inject({ method: 'POST', url: '/api/v1/report', payload: { token, seconds } });

export const validate = (app: App, token: string) => app.inject({ method: 'GET', url: `/api/v1/validate/${token}` });

export const profile = (app: App, token: string) => app.inject({ method: 'GET', url: `/api/v1/profile/${token}` });

/** A user that already has a CLI token. */
export async function createUserWithToken(app: App, username?: string): Promise<TestUser & { cli: string }> {
  const user = await createUser(app, username);
  return { ...user, cli: await fetchToken(app, user) };
}
