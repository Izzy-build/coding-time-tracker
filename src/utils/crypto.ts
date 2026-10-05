import { createHash } from 'node:crypto';

/** SHA-256 hex digest. Appropriate for high-entropy random tokens (not for passwords). */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
}
