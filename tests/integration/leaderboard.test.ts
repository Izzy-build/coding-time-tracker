import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, createUserWithToken, report, signin, type TestContext } from '../helpers/app.js';

let ctx: TestContext;
const cli: Record<string, string> = {};

interface Board {
  data: { rank: number; username: string; totalSeconds: number; formattedTime: string }[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const board = async (query = ''): Promise<Board> => {
  const res = await ctx.app.inject({ method: 'GET', url: `/api/v1/leaderboard${query}` });
  expect(res.statusCode).toBe(200);
  return res.json<Board>();
};
const names = (b: { data: { username: string }[] }) => b.data.map((e) => e.username);

beforeAll(async () => {
  ctx = await createTestContext();
  for (const n of ['alice', 'bob', 'carol', 'dave', 'erin']) cli[n] = (await createUserWithToken(ctx.app, n)).cli;
  // alice 6400, bob 1200 (2 reports), carol 1200 (tie with bob), dave 300, erin never reports
  await report(ctx.app, cli.alice!, 3600);
  await report(ctx.app, cli.alice!, 2800);
  await report(ctx.app, cli.bob!, 600);
  await report(ctx.app, cli.bob!, 600);
  await report(ctx.app, cli.carol!, 1200);
  await report(ctx.app, cli.dave!, 300);
});
afterAll(async () => {
  await ctx.close();
});

describe('GET /leaderboard', () => {
  it('is public and orders users by cumulative coding seconds (desc)', async () => {
    const b = await board();
    expect(b.data.map((e) => e.totalSeconds)).toEqual([6400, 1200, 1200, 300]);
    expect(names(b)[0]).toBe('alice');
    expect(names(b)[3]).toBe('dave');
  });

  it('gives tied users the same rank, skips the next, and orders ties by username', async () => {
    const b = await board();
    expect(b.data.map((e) => [e.rank, e.username])).toEqual([
      [1, 'alice'],
      [2, 'bob'],
      [2, 'carol'],
      [4, 'dave'],
    ]);
  });

  it('includes a formatted time and only public fields', async () => {
    const b = await board();
    expect(b.data[0]).toEqual({ rank: 1, username: 'alice', totalSeconds: 6400, formattedTime: '1h 46m' });
    expect(b.data[3]?.formattedTime).toBe('5m');
    const raw = JSON.stringify(b);
    expect(raw).not.toMatch(/email|password|hash|ctt_|userId/i);
  });

  it('omits users with no reported time', async () => {
    expect(names(await board())).not.toContain('erin');
    // a brand-new account (via /signin) is not listed until it reports
    await signin(ctx.app, 'fresh@example.com', 'a-very-good-password', { username: 'fresh_user' });
    expect(names(await board())).not.toContain('fresh_user');
  });

  it('30. totals follow new reports and the order updates', async () => {
    expect((await board()).data[0]).toMatchObject({ username: 'alice', totalSeconds: 6400 });
    // dave overtakes everyone with several reports
    for (let i = 0; i < 3; i++) await report(ctx.app, cli.dave!, 3600);
    const b = await board();
    expect(b.data[0]).toMatchObject({ rank: 1, username: 'dave', totalSeconds: 11_100 });
    expect(b.data[1]).toMatchObject({ rank: 2, username: 'alice', totalSeconds: 6400 });
    expect(b.data.find((e) => e.username === 'dave')?.formattedTime).toBe('3h 5m');
  });

  it('paginates consistently', async () => {
    const p1 = await board('?pageSize=2&page=1');
    const p2 = await board('?pageSize=2&page=2');
    const p3 = await board('?pageSize=2&page=3');
    expect(p1.pagination).toEqual({ page: 1, pageSize: 2, total: 4, totalPages: 2 });
    expect(names(p1)).toEqual(['dave', 'alice']);
    expect(names(p2)).toEqual(['bob', 'carol']);
    expect(p2.data.map((e) => e.rank)).toEqual([3, 3]);
    expect(p3.data).toEqual([]);
  });

  it('validates query parameters', async () => {
    for (const q of ['?page=0', '?pageSize=101', '?page=abc', '?pageSize=0']) {
      const res = await ctx.app.inject({ method: 'GET', url: `/api/v1/leaderboard${q}` });
      expect(res.statusCode, q).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
  });
});
