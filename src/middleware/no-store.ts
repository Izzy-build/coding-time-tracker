import type { FastifyInstance } from 'fastify';

/** Responses that carry (or are keyed by) secrets must never be cached by browsers or proxies. */
export function applyNoStore(app: FastifyInstance): void {
  app.addHook('onSend', async (_request, reply) => {
    void reply.header('cache-control', 'no-store');
  });
}
