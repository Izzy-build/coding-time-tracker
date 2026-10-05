import { eq } from 'drizzle-orm';
import type { ServiceDeps } from '../../app/context.js';
import { users, type User } from '../../db/schema.js';

/** Safe public view of a user: no password hash, no tokens. */
export function toProfile(user: User) {
  return {
    userId: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}

export function createUsersService({ db }: ServiceDeps) {
  return {
    async findById(userId: string): Promise<User | null> {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      return user ?? null;
    },
  };
}

export type UsersService = ReturnType<typeof createUsersService>;
