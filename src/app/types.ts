import type { FastifyReply } from 'fastify';

/** Minimal JWT claims: subject + type (plus iss/iat/exp added by the signer). */
export interface AccessTokenPayload {
  sub: string;
  typ: 'access';
}

/** Identity established by a website access token (JWT). */
export interface WebAuth {
  userId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    webAuth: WebAuth | null;
  }
  interface FastifyInstance {
    /** onRequest hook: requires a valid website JWT (`Authorization: Bearer <jwt>`). */
    authenticateWeb: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenPayload;
    user: AccessTokenPayload;
  }
}
