import { buildApp } from './app/build-app.js';
import { loadConfig, loadDotEnvFile } from './config/env.js';
import { createDb } from './db/client.js';

async function main(): Promise<void> {
  loadDotEnvFile();
  const config = loadConfig();
  const handle = createDb({ connectionString: config.databaseUrl, max: config.dbPoolMax });
  const app = await buildApp({ config, db: handle.db });
  app.addHook('onClose', async () => {
    await handle.close();
  });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.host, port: config.port });
}

main().catch((err: unknown) => {
  // Config errors list variable names only, never values.
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
