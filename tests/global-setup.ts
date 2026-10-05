import { runMigrations } from '../src/db/migrate.js';
import { TEST_DATABASE_URL, assertTestDatabase } from './helpers/app.js';

/** Applies the real SQL migrations to the test database once before the suite runs. */
export default async function setup(): Promise<void> {
  assertTestDatabase(TEST_DATABASE_URL);
  await runMigrations(TEST_DATABASE_URL);
}
