import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppConfig } from '../../config/env.js';
import { applyNoStore } from '../../middleware/no-store.js';
import { Errors } from '../../utils/errors.js';
import { commonErrors, errorResponse, profileSchema } from '../../utils/schemas.js';
import type { StatsService } from '../stats/stats.service.js';
import type { CliIdentity, TokensService } from '../tokens/tokens.service.js';
import { toProfile, type UsersService } from '../users/users.service.js';

interface Deps {
  tokens: TokensService;
  stats: StatsService;
  users: UsersService;
  config: AppConfig;
}

const tokenParam = z.object({
  // No max length here on purpose: any invalid token (however long) must produce the documented 401, not a 400.
  token: z.string().min(1).describe('The CLI token: 25 characters, `ctt_` + 21 letters/digits. Anything else is rejected without a database lookup.').meta({ example: 'ctt_A7k92LmX4pQ8zN3bT6vR1' }),
});

const invalidCliToken = errorResponse('INVALID_TOKEN: the CLI token is malformed (rejected before any database lookup), unknown or revoked.');

const cliProfileSchema = profileSchema.extend({
  totalSeconds: z.number().int().describe('Cumulative coding time in seconds.').meta({ example: 4700 }),
});

/**
 * Endpoints authenticated by a CLI token (in the URL or body, never the Authorization header).
 * Token resolution is centralised in TokensService.resolve().
 */
export const cliRoutes: FastifyPluginAsyncZod<Deps> = async (app, opts) => {
  applyNoStore(app);
  const { tokens, stats, users, config } = opts;
  const rateLimit = { max: config.rateLimit.cliMax, timeWindow: '1 minute' };

  async function requireCliIdentity(rawToken: string): Promise<CliIdentity> {
    const identity = await tokens.resolve(rawToken);
    if (!identity) throw Errors.invalidCliToken();
    return identity;
  }

  app.get(
    '/validate/:token',
    {
      config: { rateLimit },
      schema: {
        tags: ['CLI'],
        summary: 'Check that a CLI token is valid',
        description:
          'Used by the CLI after `ourcli config <TOKEN>`. Authenticated by the CLI token in the path (no Authorization header).\n\n' +
          '- valid token → **200** `{ "message": "User exists" }`\n' +
          '- malformed (not exactly `ctt_` + 21 letters/digits), unknown or revoked token → **401** `{ "message": "User does not exist" }`. Malformed tokens are rejected before hashing or any database query.\n\n' +
          'This is the one endpoint whose failure body is `{ message }` instead of the standard error envelope, to match the CLI contract.',
        params: tokenParam,
        response: {
          200: z.object({ message: z.literal('User exists') }).describe('The token belongs to an existing user.'),
          401: z.object({ message: z.literal('User does not exist') }).describe('Unknown or revoked token.'),
          429: commonErrors[429],
          500: commonErrors[500],
        },
      },
    },
    async (request, reply) => {
      const identity = await tokens.resolve(request.params.token);
      if (!identity) return reply.code(401).send({ message: 'User does not exist' as const });
      return reply.code(200).send({ message: 'User exists' as const });
    },
  );

  app.post(
    '/report',
    {
      config: { rateLimit },
      schema: {
        tags: ['CLI'],
        summary: 'Report newly accumulated coding time',
        description:
          'Called by the CLI about every 5 minutes. `seconds` is the coding time accumulated **since the previous report**; ' +
          'it is added to the user\'s cumulative total with a single atomic SQL increment, so concurrent reports never lose updates.\n\n' +
          `\`seconds\` must be an integer from 1 to ${config.report.maxSeconds} (configurable with REPORT_MAX_SECONDS).\n\n` +
          '**Retries:** there is no idempotency key in this version. If a response is lost and the CLI resends the same delta, it is counted twice.',
        body: z
          .object({
            token: z.string().min(1).max(2048).describe('The CLI token: 25 characters, `ctt_` + 21 letters/digits.').meta({ example: 'ctt_A7k92LmX4pQ8zN3bT6vR1' }),
            seconds: z
              .number()
              .int()
              .min(1)
              .max(config.report.maxSeconds)
              .describe(`Integer seconds since the previous report (1-${config.report.maxSeconds}).`)
              .meta({ example: 300 }),
          })
          .meta({ example: { token: 'ctt_A7k92LmX4pQ8zN3bT6vR1', seconds: 300 } }),
        response: {
          200: z
            .object({
              message: z.literal('Time reported successfully'),
              addedSeconds: z.number().int(),
              totalSeconds: z.number().int().describe('The user\'s new cumulative total, in seconds.'),
            })
            .meta({ example: { message: 'Time reported successfully', addedSeconds: 2000, totalSeconds: 4400 } })
            .describe('Time added.'),
          400: commonErrors[400],
          401: invalidCliToken,
          429: commonErrors[429],
          500: commonErrors[500],
        },
      },
    },
    async (request) => {
      const { token, seconds } = request.body;
      const { userId } = await requireCliIdentity(token);
      const totalSeconds = await stats.addSeconds(userId, seconds);
      return { message: 'Time reported successfully' as const, addedSeconds: seconds, totalSeconds };
    },
  );

  app.get(
    '/profile/:token',
    {
      config: { rateLimit },
      schema: {
        tags: ['CLI'],
        summary: 'Get the profile for a CLI token',
        description:
          'Identifies the user by CLI token and returns their safe profile fields. ' +
          'Includes the cumulative `totalSeconds`. The password hash, tokens and any other security data are never returned.',
        params: tokenParam,
        response: {
          200: cliProfileSchema.describe('The user\'s profile.'),
          401: invalidCliToken,
          429: commonErrors[429],
          500: commonErrors[500],
        },
      },
    },
    async (request) => {
      const { userId } = await requireCliIdentity(request.params.token);
      const [user, totalSeconds] = await Promise.all([users.findById(userId), stats.getTotal(userId)]);
      if (!user) throw Errors.invalidCliToken();
      return { ...toProfile(user), totalSeconds };
    },
  );
};
