import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AppConfig } from '../../config/env.js';
import { applyNoStore } from '../../middleware/no-store.js';
import { commonErrors, errorResponse, profileSchema } from '../../utils/schemas.js';
import { toProfile } from '../users/users.service.js';
import type { AuthService } from './auth.service.js';

const signinBody = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
      .pipe(z.email())
      .describe('Email address (case-insensitive).')
      .meta({ example: 'user@example.com' }),
    password: z.string().min(10).max(128).describe('10-128 characters.').meta({ example: 'correct-horse-battery' }),
    username: z
      .string()
      .trim()
      .min(3)
      .max(32)
      .regex(/^[A-Za-z0-9_-]+$/, 'Only letters, numbers, "_" and "-" are allowed.')
      .optional()
      .describe(
        'Optional. Public leaderboard name, used ONLY when this call creates the account. If omitted a neutral name like `user_1a2b3c4d` is generated.',
      )
      .meta({ example: 'izzycipherss' }),
    name: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional()
      .describe('Optional display name, used ONLY when this call creates the account.')
      .meta({ example: 'Israel' }),
  })
  .meta({ example: { email: 'user@example.com', password: 'correct-horse-battery' } });

const signinResponse = z.object({
  token: z.string().describe('Website JWT. Send as `Authorization: Bearer <token>` to /token/get and /token/update.'),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().describe('JWT lifetime in seconds.'),
  user: profileSchema,
});

export const authRoutes: FastifyPluginAsyncZod<{ auth: AuthService; config: AppConfig }> = async (app, opts) => {
  applyNoStore(app);

  app.post(
    '/signin',
    {
      config: { rateLimit: { max: opts.config.rateLimit.authMax, timeWindow: '1 minute' } },
      schema: {
        tags: ['Auth'],
        summary: 'Sign in (creates the account if it does not exist)',
        description:
          'Public. One endpoint for both registration and login.\n\n' +
          '- **Unknown email** → the account is created (password hashed with Argon2id) and a JWT is returned with **201**.\n' +
          '- **Known email** → the password is verified and a JWT is returned with **200**; a wrong password returns **401 INVALID_CREDENTIALS**.\n\n' +
          'The JWT carries only `sub` (user id), `typ`, `iss`, `iat` and `exp`. Use it as `Authorization: Bearer <token>` on the token endpoints.',
        body: signinBody,
        response: {
          200: signinResponse.describe('Existing user authenticated.'),
          201: signinResponse.describe('New account created and authenticated.'),
          400: commonErrors[400],
          401: errorResponse('INVALID_CREDENTIALS: wrong password for an existing account.'),
          409: errorResponse('USERNAME_TAKEN: the requested username is already in use (account creation only).'),
          429: commonErrors[429],
          500: commonErrors[500],
        },
      },
    },
    async (request, reply) => {
      const { user, created, accessToken, expiresIn } = await opts.auth.signin(request.body);
      return reply
        .code(created ? 201 : 200)
        .send({ token: accessToken, tokenType: 'Bearer' as const, expiresIn, user: toProfile(user) });
    },
  );
};
