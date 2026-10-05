import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export async function registerSecurity(app: FastifyInstance, config: AppConfig): Promise<void> {
  // Secure HTTP headers (CSP, HSTS, X-Content-Type-Options, frame protections, ...).
  await app.register(helmet);

  // Credentials travel in the Authorization header (not cookies), so cookies are never allowed cross-origin.
  await app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    maxAge: 600,
  });

  // In-memory store: per-process limits (fine for a single instance; see README for scaling notes).
  await app.register(rateLimit, {
    global: true,
    max: config.rateLimit.max,
    timeWindow: '1 minute',
    errorResponseBuilder: () => new AppError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.'),
  });
}
