import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { formatDuration } from '../../src/utils/duration.js';
import { describeErrorForLog, redactUrl } from '../../src/utils/redact.js';

describe('formatDuration', () => {
  it.each([
    [0, '0s'],
    [42, '42s'],
    [300, '5m'],
    [3600, '1h 0m'],
    [6400, '1h 46m'],
    [11_100, '3h 5m'],
    [-5, '0s'],
  ])('%i seconds -> %s', (seconds, expected) => expect(formatDuration(seconds)).toBe(expected));
});

describe('redactUrl', () => {
  it('masks CLI tokens wherever they appear in a URL', () => {
    expect(redactUrl('/api/v1/validate/ctt_AbC-123_xyz')).toBe('/api/v1/validate/ctt_[REDACTED]');
    expect(redactUrl('/api/v1/profile/ctt_abc?x=1')).toBe('/api/v1/profile/ctt_[REDACTED]?x=1');
    expect(redactUrl('/api/v1/leaderboard?page=2')).toBe('/api/v1/leaderboard?page=2');
  });
});

describe('describeErrorForLog', () => {
  it('drops SQL parameters and keeps the PostgreSQL code', () => {
    const cause = Object.assign(new Error('relation "x" does not exist'), { code: '42P01' });
    const err = new Error('Failed query: insert into "users" values ($1, $2)\nparams: a@b.co,$argon2id$secret', { cause });
    const out = describeErrorForLog(err);
    expect(out.pgCode).toBe('42P01');
    expect(JSON.stringify(out)).not.toContain('a@b.co');
    expect(JSON.stringify(out)).not.toContain('argon2id');
  });
});

describe('loadConfig', () => {
  const valid = { DATABASE_URL: 'postgres://u:p@localhost:5432/db', JWT_ACCESS_SECRET: 'x'.repeat(32) };

  it('applies safe defaults for the new settings', () => {
    const cfg = loadConfig(valid);
    expect(cfg.report.maxSeconds).toBe(3600);
    expect(cfg.rateLimit).toEqual({ max: 300, authMax: 10, cliMax: 60 });
    expect(cfg.jwt.accessTtlSeconds).toBe(604_800);
    expect(cfg.corsOrigins).toEqual([]);
    expect(cfg.trustProxy).toBe(false);
  });

  it('ignores variables from the old design, so an existing .env keeps working', () => {
    expect(() =>
      loadConfig({ ...valid, HEARTBEAT_INTERVAL_SECONDS: '30', IDLE_TIMEOUT_SECONDS: '120', REFRESH_TOKEN_TTL_DAYS: '30' }),
    ).not.toThrow();
  });

  it('rejects a missing or short JWT secret without echoing it', () => {
    expect(() => loadConfig({ DATABASE_URL: valid.DATABASE_URL })).toThrow(/JWT_ACCESS_SECRET/);
    let message = '';
    try {
      loadConfig({ ...valid, JWT_ACCESS_SECRET: 'short-secret-value' });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/JWT_ACCESS_SECRET/);
    expect(message).not.toContain('short-secret-value');
  });

  it('bounds REPORT_MAX_SECONDS', () => {
    expect(() => loadConfig({ ...valid, REPORT_MAX_SECONDS: '0' })).toThrow(/REPORT_MAX_SECONDS/);
    expect(() => loadConfig({ ...valid, REPORT_MAX_SECONDS: '999999' })).toThrow(/REPORT_MAX_SECONDS/);
    expect(loadConfig({ ...valid, REPORT_MAX_SECONDS: '600' }).report.maxSeconds).toBe(600);
  });

  it('parses comma-separated CORS origins', () => {
    expect(loadConfig({ ...valid, CORS_ORIGINS: 'https://a.com, https://b.com ,' }).corsOrigins).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });
});
