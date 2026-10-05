import argon2, { type HashOptions } from 'argon2';
import type { AppConfig } from '../config/env.js';

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
  /** Spend roughly the same time as a real verification (used to blunt user-enumeration timing). */
  verifyDummy(password: string): Promise<void>;
}

export function createPasswordHasher(cfg: AppConfig['argon2']): PasswordHasher {
  const options: HashOptions = {
    type: argon2.argon2id,
    memoryCost: cfg.memoryCost,
    timeCost: cfg.timeCost,
    parallelism: cfg.parallelism,
  };
  let dummyHash: Promise<string> | undefined;

  return {
    hash: (password) => argon2.hash(password, options),
    async verify(hash, password) {
      try {
        return await argon2.verify(hash, password);
      } catch {
        return false;
      }
    },
    async verifyDummy(password) {
      dummyHash ??= argon2.hash('dummy-password-for-timing-only', options);
      await argon2.verify(await dummyHash, password).catch(() => false);
    },
  };
}
