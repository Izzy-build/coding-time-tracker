import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import { AppError, type ErrorDetail } from '../utils/errors.js';
import { describeErrorForLog } from '../utils/redact.js';

function send(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  status: number,
  code: string,
  message: string,
  details?: ErrorDetail[],
) {
  return reply.status(status).send({ error: { code, message, ...(details ? { details } : {}) } });
}

/**
 * One consistent error envelope: { error: { code, message, details? } }.
 * Internal errors are logged server-side and never leaked to clients.
 */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((_request, reply) => send(reply, 404, 'NOT_FOUND', 'Route not found.'));

  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    if (error instanceof AppError) {
      return send(reply, error.statusCode, error.code, error.message, error.details);
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const details: ErrorDetail[] = error.validation.map((v) => ({
        in: error.validationContext,
        path: v.instancePath.replace(/^\//, '').replaceAll('/', '.'),
        message: v.message ?? 'Invalid value.',
      }));
      return send(reply, 400, 'VALIDATION_ERROR', 'The request is invalid.', details);
    }

    if (isResponseSerializationError(error)) {
      request.log.error({ err: describeErrorForLog(error) }, 'response did not match its schema');
      return send(reply, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
    }

    // Framework-level client errors (malformed JSON, body too large, wrong content-type, ...).
    const status = (error as FastifyError).statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      const mapped: Record<number, [string, string]> = {
        400: ['BAD_REQUEST', 'The request could not be parsed.'],
        413: ['PAYLOAD_TOO_LARGE', 'The request body is too large.'],
        414: ['URI_TOO_LONG', 'The request URL is too long.'],
        415: ['UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.'],
        429: ['RATE_LIMITED', 'Too many requests. Please slow down.'],
      };
      const [code, message] = mapped[status] ?? ['BAD_REQUEST', 'The request could not be processed.'];
      return send(reply, status, code, message);
    }

    // Never log the raw error object: ORM errors embed SQL parameters (emails, hashes).
    request.log.error({ err: describeErrorForLog(error) }, 'unhandled error');
    return send(reply, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
  });
}
