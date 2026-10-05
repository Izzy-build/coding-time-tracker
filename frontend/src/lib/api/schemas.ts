import { z } from 'zod';
import { CLI_TOKEN_PATTERN } from '@/lib/cli-token';

/** Runtime schemas for every backend response the UI consumes (also the source of the TS types). */
export const publicUserSchema = z.object({
  userId: z.string(),
  username: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  createdAt: z.string(),
});

export const signinResponseSchema = z.object({
  token: z.string().min(1),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(),
  user: publicUserSchema,
});

export const cliTokenResponseSchema = z.object({ token: z.string().regex(CLI_TOKEN_PATTERN) });

export const cliProfileSchema = publicUserSchema.extend({ totalSeconds: z.number().int().nonnegative() });

export const leaderboardEntrySchema = z.object({
  rank: z.number().int().positive(),
  username: z.string(),
  totalSeconds: z.number().int().nonnegative(),
  formattedTime: z.string(),
});

export const leaderboardResponseSchema = z.object({
  data: z.array(leaderboardEntrySchema),
  pagination: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

/** Standard backend error envelope. */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ in: z.string().optional(), path: z.string(), message: z.string() })).optional(),
  }),
});

export type PublicUser = z.infer<typeof publicUserSchema>;
export type SigninResponse = z.infer<typeof signinResponseSchema>;
export type CliProfile = z.infer<typeof cliProfileSchema>;
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>;
