import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { applyNoStore } from '../../middleware/no-store.js';
import { requireWebAuth } from '../../middleware/authenticate.js';
import { commonErrors, errorResponse, unauthorizedResponse } from '../../utils/schemas.js';
import type { TokensService } from './tokens.service.js';

const tokenResponse = z.object({
  token: z.string().meta({
    description:
      'The raw CLI token: exactly 25 characters, `ctt_` followed by 21 letters/digits. It is shown ONLY in this response and cannot be retrieved later.',
    example: 'ctt_A7k92LmX4pQ8zN3bT6vR1',
  }),
});

export const tokensRoutes: FastifyPluginAsyncZod<{ tokens: TokensService }> = async (app, opts) => {
  applyNoStore(app);

  app.get(
    '/token/:action',
    {
      onRequest: [app.authenticateWeb],
      schema: {
        tags: ['CLI Token'],
        summary: 'Generate or rotate the CLI token',
        description:
          'Requires the **website JWT** (`Authorization: Bearer <jwt>`); a CLI token is not accepted here.\n\n' +
          '- `get` — generates the account\'s CLI token. Only a SHA-256 hash is stored, so the raw value is returned once. ' +
          'If the account already has an active token the call fails with **409 TOKEN_ALREADY_EXISTS** (use `update`).\n' +
          '- `update` — rotates the token: the current token is revoked **immediately** (it stops working on `/validate`, `/report` and `/profile`) ' +
          'and a new one is returned. Use it if the token may be compromised or has been lost.\n\n' +
          'Any other action returns **400 VALIDATION_ERROR**. Responses are `Cache-Control: no-store`.',
        security: [{ webBearer: [] }],
        params: z.object({
          action: z.enum(['get', 'update']).describe('`get` = generate, `update` = rotate.'),
        }),
        response: {
          200: tokenResponse.describe('The new CLI token.'),
          400: commonErrors[400],
          401: unauthorizedResponse,
          409: errorResponse('TOKEN_ALREADY_EXISTS: `get` was called while a token is already active.'),
          429: commonErrors[429],
          500: commonErrors[500],
        },
      },
    },
    async (request) => {
      const { userId } = requireWebAuth(request);
      const token =
        request.params.action === 'get' ? await opts.tokens.issue(userId) : await opts.tokens.rotate(userId);
      return { token };
    },
  );
};
