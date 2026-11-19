import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

export default async function globalTeardown(): Promise<void> {
  const container = (globalThis as Record<string, unknown>).__E2E_PG__ as
    StartedPostgreSqlContainer | undefined;
  await container?.stop();
}
