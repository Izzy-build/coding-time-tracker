import { z } from 'zod';
import { publicUserSchema, type PublicUser, type SigninResponse } from '@/lib/api/schemas';
import { setEndReason } from './end-reason';
import { createPersistentStore } from './persistent-store';

/**
 * The website session: the JWT, when it stops being valid, and the (non-secret) profile fields from sign-in.
 * The JWT is the only credential kept here. Passwords are never stored anywhere, and the CLI token has its own,
 * shorter-lived store (see cli-token-store.ts).
 */
export interface StoredSession {
  token: string;
  /** Epoch ms after which the JWT must not be used. */
  expiresAt: number;
  user: PublicUser;
}

const storedSessionSchema = z.object({ token: z.string().min(1), expiresAt: z.number(), user: publicUserSchema });

/** Treat the token as expired slightly early so we never send a JWT that dies in flight. */
const EXPIRY_SKEW_MS = 10_000;

export const sessionStore = createPersistentStore<StoredSession>({
  key: 'ctt.session.v1',
  area: 'local',
  serialize: (session) => JSON.stringify(session),
  parse(raw) {
    try {
      const parsed = storedSessionSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) return null;
      if (parsed.data.expiresAt - EXPIRY_SKEW_MS <= Date.now()) {
        setEndReason('expired'); // a stored session that outlived its JWT
        return null;
      }
      return parsed.data;
    } catch {
      return null;
    }
  },
});

export function toStoredSession(response: SigninResponse, now = Date.now()): StoredSession {
  return { token: response.token, expiresAt: now + response.expiresIn * 1000, user: response.user };
}
