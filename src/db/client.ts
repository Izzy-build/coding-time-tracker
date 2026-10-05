import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  pool: pg.Pool;
  close: () => Promise<void>;
}

export function createDb(options: { connectionString: string; max: number }): DbHandle {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    max: options.max,
    // Server-side safety nets: never let a stuck query/transaction hold connections forever.
    statement_timeout: 15_000,
    idle_in_transaction_session_timeout: 15_000,
  });
  // An idle client erroring must not crash the process.
  pool.on('error', () => undefined);
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}

/** Extract the underlying PostgreSQL error (drizzle may wrap driver errors in `cause`). */
export function getPgError(err: unknown): { code?: string; constraint?: string } | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth++) {
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof candidate.code === 'string' && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return {
        code: candidate.code,
        constraint: typeof candidate.constraint === 'string' ? candidate.constraint : undefined,
      };
    }
    current = candidate.cause;
  }
  return undefined;
}

export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const pgErr = getPgError(err);
  return pgErr?.code === '23505' && (constraint === undefined || pgErr.constraint === constraint);
}
