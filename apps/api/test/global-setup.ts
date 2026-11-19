import { execSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

/** One throwaway Postgres for the whole e2e run; each spec file gets its own database. Never the dev DB. */
export default async function globalSetup(): Promise<void> {
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 15_000 });
  } catch {
    throw new Error(
      'API e2e tests need Docker: start Docker Desktop (or your Docker daemon) and run again.',
    );
  }
  const container = await new PostgreSqlContainer('postgres:18-alpine').start();
  process.env.E2E_PG_ADMIN_URL = container.getConnectionUri();
  (globalThis as Record<string, unknown>).__E2E_PG__ = container;
}
