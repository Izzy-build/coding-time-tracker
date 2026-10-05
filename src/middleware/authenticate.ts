import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AccessTokenPayload, WebAuth } from '../app/types.js';
import { extractBearerToken } from '../utils/crypto.js';
import { Errors } from '../utils/errors.js';

/**
 * Website authentication: a signed JWT in `Authorization: Bearer`.
 * CLI tokens (`ctt_...`) are NOT JWTs and are rejected here; CLI endpoints never read this header
 * (they take the token from the URL/body and resolve it via TokensService).
 */
export function registerAuthentication(app: FastifyInstance): void {
  app.decorateRequest('webAuth', null);

  app.decorate('authenticateWeb', async (request: FastifyRequest) => {
    const raw = extractBearerToken(request.headers.authorization);
    if (!raw) throw Errors.unauthorized();
    let payload: AccessTokenPayload;
    try {
      payload = app.jwt.verify<AccessTokenPayload>(raw);
    } catch (err) {
      const code = (err as { code?: string }).code;
      throw code === 'FAST_JWT_EXPIRED' ? Errors.tokenExpired() : Errors.invalidToken();
    }
    if (payload.typ !== 'access' || typeof payload.sub !== 'string') throw Errors.invalidToken();
    request.webAuth = { userId: payload.sub };
  });
}

export function requireWebAuth(request: FastifyRequest): WebAuth {
  if (!request.webAuth) throw Errors.unauthorized();
  return request.webAuth;
}
