import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { loadDotEnvFile } from '../config/env.js';
import { createDb } from './client.js';

/** Applies SQL migrations from ./drizzle. Run from the project root. */
export async function runMigrations(connectionString: string): Promise<void> {
  const handle = createDb({ connectionString, max: 1 });
  try {
    await migrate(handle.db, { migrationsFolder: path.resolve(process.cwd(), 'drizzle') });
  } finally {
    await handle.close();
  }
}

// CLI entry point: `npm run db:migrate`
const isMain = process.argv[1] !== undefined && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) {
  loadDotEnvFile();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  runMigrations(url)
    .then(() => console.log('Migrations applied.'))
    .catch((err: unknown) => {
      console.error('Migration failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
