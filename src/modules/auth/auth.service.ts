import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { ServiceDeps } from '../../app/context.js';
import { getPgError } from '../../db/client.js';
import { codingStats, users, type User } from '../../db/schema.js';
import { Errors } from '../../utils/errors.js';
import type { PasswordHasher } from '../../utils/password.js';

export interface AuthDeps extends ServiceDeps {
  hasher: PasswordHasher;
  signAccessToken: (userId: string) => string;
}

export interface SigninInput {
  email: string;
  password: string;
  /** Only used when the account is created. */
  username?: string | undefined;
  /** Only used when the account is created. */
  name?: string | undefined;
}

export interface SigninResult {
  user: User;
  created: boolean;
  accessToken: string;
  expiresIn: number;
}

/** A neutral, non-identifying public name (the email is private and must not leak onto the leaderboard). */
const generateUsername = () => `user_${randomBytes(4).toString('hex')}`;

export function createAuthService(deps: AuthDeps) {
  const { db, config, clock, hasher, signAccessToken } = deps;

  const result = (user: User, created: boolean): SigninResult => ({
    user,
    created,
    accessToken: signAccessToken(user.id),
    expiresIn: config.jwt.accessTtlSeconds,
  });

  async function findByEmail(email: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return user ?? null;
  }

  async function login(user: User, password: string): Promise<SigninResult> {
    if (!(await hasher.verify(user.passwordHash, password))) throw Errors.invalidCredentials();
    return result(user, false);
  }

  async function create(input: SigninInput): Promise<User> {
    const passwordHash = await hasher.hash(input.password);
    const now = clock();
    const explicitUsername = input.username !== undefined;

    for (let attempt = 0; attempt < 5; attempt++) {
      const username = input.username ?? generateUsername();
      try {
        return await db.transaction(async (tx) => {
          const [user] = await tx
            .insert(users)
            .values({ username, name: input.name ?? null, email: input.email, passwordHash, createdAt: now, updatedAt: now })
            .returning();
          // The coding-time record is created together with the user.
          await tx.insert(codingStats).values({ userId: user!.id, totalSeconds: 0, updatedAt: now });
          return user!;
        });
      } catch (err) {
        const pg = getPgError(err);
        if (pg?.code === '23505' && pg.constraint === 'users_username_lower_uq') {
          if (explicitUsername) throw Errors.usernameTaken();
          continue; // generated name collided: try another
        }
        throw err;
      }
    }
    throw Errors.usernameTaken();
  }

  return {
    /**
     * Create-or-login in one call.
     *  - unknown email: create the account (Argon2id) + its coding_stats row, return a JWT
     *  - known email: verify the password, return a JWT
     * Both branches cost one Argon2 operation, so timing does not reveal which one ran.
     */
    async signin(input: SigninInput): Promise<SigninResult> {
      const existing = await findByEmail(input.email);
      if (existing) return login(existing, input.password);

      try {
        return result(await create(input), true);
      } catch (err) {
        // Two concurrent first sign-ins for the same email: the loser falls back to a normal login.
        const pg = getPgError(err);
        if (pg?.code === '23505' && pg.constraint === 'users_email_uq') {
          const winner = await findByEmail(input.email);
          if (winner) return login(winner, input.password);
        }
        throw err;
      }
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
