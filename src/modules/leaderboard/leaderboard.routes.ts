import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { buildPagination, commonErrors, paginationQuery, paginationSchema } from '../../utils/schemas.js';
import type { LeaderboardService } from './leaderboard.service.js';

const leaderboardResponse = z.object({
  data: z.array(
    z.object({
      rank: z.number().int().describe('1-based. Users with equal totals share a rank.').meta({ example: 1 }),
      username: z.string().meta({ example: 'izzycipherss' }),
      totalSeconds: z.number().int().describe('Cumulative coding time in seconds.').meta({ example: 6400 }),
      formattedTime: z.string().describe('Human-readable total.').meta({ example: '1h 46m' }),
    }),
  ),
  pagination: paginationSchema,
});

export const leaderboardRoutes: FastifyPluginAsyncZod<{ leaderboard: LeaderboardService }> = async (app, opts) => {
  app.get(
    '/leaderboard',
    {
      schema: {
        tags: ['Leaderboard'],
        summary: 'Public leaderboard',
        description:
          'Public (no authentication). Users ranked by cumulative coding seconds, highest first; users with no recorded time are not listed. ' +
          'Only the username and totals are exposed.',
        querystring: paginationQuery,
        response: {
          200: leaderboardResponse.describe('A page of ranked users.'),
          400: commonErrors[400],
          429: commonErrors[429],
          500: commonErrors[500],
        },
      },
    },
    async (request) => {
      const { page, pageSize } = request.query;
      const { entries, total } = await opts.leaderboard.getPage(page, pageSize);
      return { data: entries, pagination: buildPagination(page, pageSize, total) };
    },
  );
};
