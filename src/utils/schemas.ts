import { z } from 'zod';

export const errorEnvelope = z.object({
  error: z.object({
    code: z.string().meta({ example: 'INVALID_TOKEN' }),
    message: z.string().meta({ example: 'The provided token is invalid.' }),
    details: z
      .array(z.object({ in: z.string().optional(), path: z.string(), message: z.string() }))
      .optional()
      .meta({ description: 'Present for VALIDATION_ERROR: one entry per invalid field.' }),
  }),
});

/** Error response schema with a status-specific description for the OpenAPI document. */
export const errorResponse = (description: string) => errorEnvelope.describe(description);

export const commonErrors = {
  400: errorResponse('VALIDATION_ERROR: the request body, query or path parameters are invalid.'),
  429: errorResponse('RATE_LIMITED: too many requests; see the Retry-After header.'),
  500: errorResponse('INTERNAL_ERROR: unexpected server error.'),
};

export const unauthorizedResponse = errorResponse(
  'UNAUTHORIZED / INVALID_TOKEN / TOKEN_EXPIRED: missing, invalid or expired website JWT.',
);

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1).describe('1-based page number.'),
  pageSize: z.coerce.number().int().min(1).max(100).default(20).describe('Items per page (max 100).'),
});

export const paginationSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export function buildPagination(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

export const isoDate = z.iso.datetime().meta({ example: '2026-10-01T09:30:00.000Z' });

/** Public-safe user fields. Never includes the password hash or any token. */
export const profileSchema = z.object({
  userId: z.uuid(),
  username: z.string().meta({ example: 'izzycipherss' }),
  name: z.string().nullable().meta({ example: 'Israel' }),
  email: z.string().meta({ example: 'user@example.com' }),
  createdAt: isoDate,
});
