import { z } from 'zod';
import { isCliToken } from '@/lib/cli-token';
import { createPersistentStore } from './persistent-store';

/**
 * The raw CLI token, kept ONLY so the dashboard can mask/copy it and call `/profile/:token`.
 *
 * Deliberate trade-off: the backend stores only a hash, so a lost raw token can never be fetched again.
 * We keep it in sessionStorage (this tab only, gone when the tab closes, never shared with other tabs) rather
 * than localStorage, and bind it to the user id so it can't leak across accounts. Signing out clears it.
 */
interface StoredCliToken {
  userId: string;
  token: string;
}

const schema = z.object({ userId: z.string().min(1), token: z.string().refine(isCliToken) });

export const cliTokenStore = createPersistentStore<StoredCliToken>({
  key: 'ctt.cli-token.v1',
  area: 'session',
  serialize: (value) => JSON.stringify(value),
  parse(raw) {
    try {
      const parsed = schema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  },
});
