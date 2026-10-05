import { existsSync } from 'node:fs';
import { z } from 'zod';

const boolString = z.enum(['true', 'false']).transform((v) => v === 'true');

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgres:// connection string'),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

    JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
    JWT_ISSUER: z.string().min(1).default('coding-time-tracker'),
    // Website JWT lifetime. There is no refresh endpoint, so the default is 7 days.
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(2_592_000).default(604_800),

    CORS_ORIGINS: z.string().default(''),
    TRUST_PROXY: boolString.default(false),
    DOCS_ENABLED: boolString.default(true),

    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
    // Per-IP limit for the CLI endpoints (validate/report/profile). The CLI reports about every 5 minutes.
    CLI_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(60),

    // Largest number of seconds one POST /report may add (the CLI sends ~300 every 5 minutes).
    REPORT_MAX_SECONDS: z.coerce.number().int().min(1).max(86_400).default(3600),

    ARGON2_MEMORY_KIB: z.coerce.number().int().min(8).default(65_536),
    ARGON2_TIME_COST: z.coerce.number().int().min(1).default(3),
    ARGON2_PARALLELISM: z.coerce.number().int().min(1).default(1),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  logLevel: string;
  databaseUrl: string;
  dbPoolMax: number;
  jwt: { secret: string; issuer: string; accessTtlSeconds: number };
  corsOrigins: string[];
  trustProxy: boolean;
  docsEnabled: boolean;
  rateLimit: { max: number; authMax: number; cliMax: number };
  report: { maxSeconds: number };
  argon2: { memoryCost: number; timeCost: number; parallelism: number };
}

/**
 * Parse and validate configuration. Throws a descriptive error (never printing
 * secret values) when anything is missing or malformed.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  return {
    nodeEnv: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    databaseUrl: e.DATABASE_URL,
    dbPoolMax: e.DB_POOL_MAX,
    jwt: { secret: e.JWT_ACCESS_SECRET, issuer: e.JWT_ISSUER, accessTtlSeconds: e.JWT_ACCESS_TTL_SECONDS },
    corsOrigins: e.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    trustProxy: e.TRUST_PROXY,
    docsEnabled: e.DOCS_ENABLED,
    rateLimit: { max: e.RATE_LIMIT_MAX, authMax: e.AUTH_RATE_LIMIT_MAX, cliMax: e.CLI_RATE_LIMIT_MAX },
    report: { maxSeconds: e.REPORT_MAX_SECONDS },
    argon2: { memoryCost: e.ARGON2_MEMORY_KIB, timeCost: e.ARGON2_TIME_COST, parallelism: e.ARGON2_PARALLELISM },
  };
}

/** Load `.env` (if present) into process.env without overriding real environment variables. */
export function loadDotEnvFile(path = '.env'): void {
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}
