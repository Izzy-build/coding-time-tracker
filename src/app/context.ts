import type { AppConfig } from '../config/env.js';
import type { Database } from '../db/client.js';

/** Source of "now". Injected so tests can control time; production uses the server clock. */
export type Clock = () => Date;

export interface ServiceDeps {
  db: Database;
  config: AppConfig;
  clock: Clock;
}
