import { count, desc, gt, sql } from 'drizzle-orm';
import type { ServiceDeps } from '../../app/context.js';
import { codingStats, users } from '../../db/schema.js';
import { formatDuration } from '../../utils/duration.js';

export function createLeaderboardService({ db }: ServiceDeps) {
  return {
    /**
     * Users ranked by cumulative coding seconds (descending). Users with no recorded time are
     * omitted. Ties share a rank (RANK()), so "1, 2, 2, 4". Backed by coding_stats_total_seconds_idx.
     */
    async getPage(page: number, pageSize: number) {
      const rank = sql<number>`rank() over (order by ${codingStats.totalSeconds} desc)`.mapWith(Number);
      const [rows, [totalRow]] = await Promise.all([
        db
          .select({ rank, username: users.username, totalSeconds: codingStats.totalSeconds })
          .from(codingStats)
          .innerJoin(users, sql`${users.id} = ${codingStats.userId}`)
          .where(gt(codingStats.totalSeconds, 0))
          .orderBy(desc(codingStats.totalSeconds), sql`lower(${users.username})`)
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db.select({ n: count() }).from(codingStats).where(gt(codingStats.totalSeconds, 0)),
      ]);
      return {
        entries: rows.map((r) => ({
          rank: r.rank,
          username: r.username,
          totalSeconds: r.totalSeconds,
          formattedTime: formatDuration(r.totalSeconds),
        })),
        total: totalRow?.n ?? 0,
      };
    },
  };
}

export type LeaderboardService = ReturnType<typeof createLeaderboardService>;
