import { sql } from 'drizzle-orm';
import { bigint, check, index, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

// All timestamps are `timestamptz` (UTC instants).
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Public display name used on the leaderboard. Unique, case-insensitive. */
    username: varchar('username', { length: 32 }).notNull(),
    /** Optional real/display name. */
    name: varchar('name', { length: 100 }),
    /** Stored lower-cased and trimmed by the application. */
    email: varchar('email', { length: 254 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('users_email_uq').on(t.email),
    uniqueIndex('users_username_lower_uq').on(sql`lower(${t.username})`),
    check('users_email_lowercase_chk', sql`${t.email} = lower(${t.email})`),
  ],
);

/**
 * CLI tokens. Only a SHA-256 hash is stored (tokens are 25-char random values, ~125 bits, so a fast hash is
 * safe and gives an indexed O(log n) lookup). Rotation revokes the old row and inserts a new one.
 */
export const cliTokens = pgTable(
  'cli_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [
    // The lookup used by validate/report/profile.
    uniqueIndex('cli_tokens_token_hash_uq').on(t.tokenHash),
    // At most ONE active token per user (enforced by the database, not just the application).
    uniqueIndex('cli_tokens_one_active_per_user_uq')
      .on(t.userId)
      .where(sql`${t.revokedAt} is null`),
    index('cli_tokens_user_idx').on(t.userId),
  ],
);

/** Cumulative coding time per user. The CLI reports deltas; the database adds them atomically. */
export const codingStats = pgTable(
  'coding_stats',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Integer seconds (never floating-point hours). */
    totalSeconds: bigint('total_seconds', { mode: 'number' }).notNull().default(0),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('coding_stats_user_id_uq').on(t.userId),
    // Leaderboard ordering.
    index('coding_stats_total_seconds_idx').on(t.totalSeconds.desc()),
    check('coding_stats_total_nonneg_chk', sql`${t.totalSeconds} >= 0`),
  ],
);

export type User = typeof users.$inferSelect;
export type CliToken = typeof cliTokens.$inferSelect;
export type CodingStats = typeof codingStats.$inferSelect;
