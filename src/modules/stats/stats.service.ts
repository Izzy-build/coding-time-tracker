import { eq, sql } from 'drizzle-orm';
import type { ServiceDeps } from '../../app/context.js';
import { codingStats } from '../../db/schema.js';

export function createStatsService({ db, clock }: ServiceDeps) {
  return {
    /**
     * Adds `seconds` to the user's cumulative total and returns the new total.
     *
     * ATOMIC: a single `INSERT ... ON CONFLICT (user_id) DO UPDATE SET total_seconds = total_seconds + $n`.
     * PostgreSQL takes a row lock for the update, so concurrent reports serialise and none is lost
     * (no read-modify-write in JavaScript). The upsert also covers a user whose stats row is missing.
     */
    async addSeconds(userId: string, seconds: number): Promise<number> {
      const now = clock();
      const [row] = await db
        .insert(codingStats)
        .values({ userId, totalSeconds: seconds, updatedAt: now })
        .onConflictDoUpdate({
          target: codingStats.userId,
          set: {
            totalSeconds: sql`${codingStats.totalSeconds} + ${seconds}`,
            updatedAt: now,
          },
        })
        .returning({ totalSeconds: codingStats.totalSeconds });
      return row!.totalSeconds;
    },

    async getTotal(userId: string): Promise<number> {
      const [row] = await db
        .select({ totalSeconds: codingStats.totalSeconds })
        .from(codingStats)
        .where(eq(codingStats.userId, userId))
        .limit(1);
      return row?.totalSeconds ?? 0;
    },
  };
}

export type StatsService = ReturnType<typeof createStatsService>;
