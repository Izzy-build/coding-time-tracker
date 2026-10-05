import { apiRequest } from './client';
import { leaderboardResponseSchema, type LeaderboardEntry, type LeaderboardResponse } from './schemas';

export const MAX_PAGE_SIZE = 100;

/** GET /leaderboard (public). */
export async function getLeaderboard(page: number, pageSize: number, signal?: AbortSignal): Promise<LeaderboardResponse> {
  const { data } = await apiRequest({
    path: `/leaderboard?page=${page}&pageSize=${pageSize}`,
    schema: leaderboardResponseSchema,
    ...(signal ? { signal } : {}),
  });
  return data;
}

export type StandingResult =
  /** The user is on the board. */
  | { kind: 'found'; entry: LeaderboardEntry }
  /** Whole board scanned, user absent: the backend omits users with no coding time, so their total is 0. */
  | { kind: 'absent' }
  /** Stopped scanning at the page cap before reaching the end: unknown. */
  | { kind: 'unknown' };

/**
 * Finds a user's standing using only the public leaderboard. Used when the CLI token (needed for /profile)
 * is not available in this browser tab. The board is ordered by total, not name, so it is scanned page by page;
 * the cap keeps this bounded on very large boards.
 */
export async function findStanding(username: string, signal?: AbortSignal, maxPages = 20): Promise<StandingResult> {
  const wanted = username.toLowerCase();
  for (let page = 1; page <= maxPages; page++) {
    const board = await getLeaderboard(page, MAX_PAGE_SIZE, signal);
    const entry = board.data.find((e) => e.username.toLowerCase() === wanted);
    if (entry) return { kind: 'found', entry };
    if (page >= board.pagination.totalPages) return { kind: 'absent' };
  }
  return { kind: 'unknown' };
}
