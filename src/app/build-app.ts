import fastifyJwt from '@fastify/jwt';
import { sql } from 'drizzle-orm';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { AppConfig } from '../config/env.js';
import type { Database } from '../db/client.js';
import { registerAuthentication } from '../middleware/authenticate.js';
import { registerErrorHandling } from '../middleware/error-handler.js';
import { authRoutes } from '../modules/auth/auth.routes.js';
import { createAuthService } from '../modules/auth/auth.service.js';
import { leaderboardRoutes } from '../modules/leaderboard/leaderboard.routes.js';
import { createLeaderboardService } from '../modules/leaderboard/leaderboard.service.js';
import { cliRoutes } from '../modules/cli/cli.routes.js';
import { createStatsService } from '../modules/stats/stats.service.js';
import { tokensRoutes } from '../modules/tokens/tokens.routes.js';
import { createTokensService } from '../modules/tokens/tokens.service.js';
import { createUsersService } from '../modules/users/users.service.js';
import { registerDocs } from '../plugins/docs.js';
import { registerSecurity } from '../plugins/security.js';
import { createPasswordHasher } from '../utils/password.js';
import { redactUrl } from '../utils/redact.js';
import type { AccessTokenPayload } from './types.js';
import './types.js';
import type { Clock } from './context.js';

export interface BuildAppOptions {
  config: AppConfig;
  db: Database;
  /** Defaults to the real server clock. Tests inject a controllable clock. */
  clock?: Clock;
  /** Set false to silence logging (tests). */
  logger?: boolean;
  /** Send logs to a custom stream instead of stdout (tests assert that no secrets are logged). */
  logStream?: NodeJS.WritableStream;
}

export async function buildApp(options: BuildAppOptions) {
  const { config, db } = options;
  const clock: Clock = options.clock ?? (() => new Date());

  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: config.logLevel,
            ...(options.logStream ? { stream: options.logStream } : {}),
            serializers: {
              // CLI tokens are part of some URLs (/validate/:token, /profile/:token): never log them.
              req: (req: { method?: string; url?: string; ip?: string }) => ({
                method: req.method,
                url: redactUrl(req.url ?? ''),
                remoteAddress: req.ip,
              }),
            },
            // Defence in depth: credentials must never reach the logs.
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
                '*.password',
                '*.passwordHash',
                '*.accessToken',
                '*.token',
                '*.tokenHash',
              ],
              censor: '[REDACTED]',
            },
            ...(config.nodeEnv === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
          },
    trustProxy: config.trustProxy,
    bodyLimit: 16 * 1024,
    // CLI tokens are path parameters; the default limit (100) would answer a long/garbage token with 414
    // instead of the contract's "User does not exist". Malformed tokens are rejected by the format check without a DB query.
    routerOptions: { ignoreTrailingSlash: true, maxParamLength: 512 },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandling(app);

  await registerSecurity(app, config);
  await app.register(fastifyJwt, {
    secret: config.jwt.secret,
    sign: { algorithm: 'HS256', expiresIn: config.jwt.accessTtlSeconds, iss: config.jwt.issuer },
    verify: { algorithms: ['HS256'], allowedIss: config.jwt.issuer },
  });

  // ---- services (each module owns its logic; routes stay thin) ----
  const deps = { db, config, clock };
  const hasher = createPasswordHasher(config.argon2);
  const signAccessToken = (userId: string) =>
    app.jwt.sign({ sub: userId, typ: 'access' } satisfies AccessTokenPayload);
  const tokens = createTokensService(deps);
  const auth = createAuthService({ ...deps, hasher, signAccessToken });
  const users = createUsersService(deps);
  const stats = createStatsService(deps);
  const leaderboard = createLeaderboardService(deps);

  registerAuthentication(app);
  if (config.docsEnabled) await registerDocs(app);

  // Final public contract: everything lives under /api/v1.
  await app.register(authRoutes, { prefix: '/api/v1', auth, config }); //            POST /signin
  await app.register(tokensRoutes, { prefix: '/api/v1', tokens }); //                GET  /token/:action        (website JWT)
  await app.register(cliRoutes, { prefix: '/api/v1', tokens, stats, users, config }); // GET /validate/:token, POST /report, GET /profile/:token (CLI token)
  await app.register(leaderboardRoutes, { prefix: '/api/v1', leaderboard }); //      GET  /leaderboard

  // Liveness/readiness probe for deployments (not part of the public API contract).
  app.get('/health', { schema: { hide: true } }, async (_request, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { status: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
