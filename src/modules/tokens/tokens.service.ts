import { and, eq, isNull } from 'drizzle-orm';
import type { ServiceDeps } from '../../app/context.js';
import { isUniqueViolation } from '../../db/client.js';
import { cliTokens, users } from '../../db/schema.js';
import { sha256Hex } from '../../utils/crypto.js';
import { Errors } from '../../utils/errors.js';
import { generateCliToken, isValidCliTokenFormat } from './token-format.js';

export interface CliIdentity {
  userId: string;
  tokenId: string;
}

export function createTokensService({ db, clock }: ServiceDeps) {
  /** Locks the user row so concurrent get/update calls for one user are serialised. */
  async function lockUser(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], userId: string) {
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
    if (!user) throw Errors.unauthorized(); // valid JWT for an account that no longer exists
  }

  const insertToken = async (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    userId: string,
    now: Date,
  ): Promise<string> => {
    const raw = generateCliToken();
    await tx.insert(cliTokens).values({ userId, tokenHash: sha256Hex(raw), createdAt: now });
    return raw;
  };

  return {
    /**
     * GET /token/get. Creates the user's CLI token. Only a hash is stored, so an existing token's
     * raw value can never be shown again: if one is already active the caller is told to rotate.
     */
    async issue(userId: string): Promise<string> {
      const now = clock();
      try {
        return await db.transaction(async (tx) => {
          await lockUser(tx, userId);
          const [active] = await tx
            .select({ id: cliTokens.id })
            .from(cliTokens)
            .where(and(eq(cliTokens.userId, userId), isNull(cliTokens.revokedAt)))
            .limit(1);
          if (active) throw Errors.tokenAlreadyExists();
          return insertToken(tx, userId, now);
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw Errors.tokenAlreadyExists();
        throw err;
      }
    },

    /** GET /token/update. Revokes the active token (if any) and issues a new one, atomically. */
    async rotate(userId: string): Promise<string> {
      const now = clock();
      return db.transaction(async (tx) => {
        await lockUser(tx, userId);
        await tx
          .update(cliTokens)
          .set({ revokedAt: now })
          .where(and(eq(cliTokens.userId, userId), isNull(cliTokens.revokedAt)));
        return insertToken(tx, userId, now);
      });
    },

    /**
     * The ONE place a raw CLI token is turned into an identity (used by validate, report and
     * profile). Flow: format check -> SHA-256 -> one indexed query on the unique `token_hash`
     * column (revoked tokens never match). A malformed token (not a string, not exactly 25
     * characters, wrong prefix or alphabet) returns null BEFORE hashing and before any database work.
     */
    async resolve(raw: unknown): Promise<CliIdentity | null> {
      if (!isValidCliTokenFormat(raw)) return null;
      const [row] = await db
        .select({ id: cliTokens.id, userId: cliTokens.userId })
        .from(cliTokens)
        .where(and(eq(cliTokens.tokenHash, sha256Hex(raw)), isNull(cliTokens.revokedAt)))
        .limit(1);
      return row ? { userId: row.userId, tokenId: row.id } : null;
    },
  };
}

export type TokensService = ReturnType<typeof createTokensService>;
