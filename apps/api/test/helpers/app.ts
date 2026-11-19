/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- supertest bodies are untyped JSON */
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import type { PrismaService as PrismaServiceType } from '../../src/prisma/prisma.service';
import { hashPassword } from '../../src/modules/auth/password';

export const PASSWORD = 'correct-horse-battery';
export const JWT_SECRET = 'e2e-secret-e2e-secret-e2e-secret-e2e-secret';
export const CSRF = { 'X-Requested-With': 'XMLHttpRequest' };

/** A settable clock for the injected `Clock` (cut-offs depend on "now"). */
export class FakeClock {
  private instant = new Date();
  now(): Date {
    return new Date(this.instant);
  }
  set(iso: string): void {
    this.instant = new Date(iso);
  }
}

export interface TestApp {
  clock: FakeClock;
  app: INestApplication;
  prisma: PrismaServiceType;
  server: ReturnType<INestApplication['getHttpServer']>;
  close: () => Promise<void>;
}

let created = false;

/**
 * Creates a fresh database in the testcontainers Postgres, migrates it and boots the full app.
 * Call once per spec file: ConfigModule reads the environment once per module registry, so a
 * second call in the same file would silently reuse the first database and settings.
 */
export async function createTestApp(env: Record<string, string> = {}): Promise<TestApp> {
  if (created) throw new Error('createTestApp() may only be called once per spec file');
  created = true;
  const adminUrl = process.env.E2E_PG_ADMIN_URL;
  if (!adminUrl) throw new Error('E2E_PG_ADMIN_URL missing: run via `pnpm api test:e2e`');
  const dbName = `e2e_${randomUUID().replace(/-/g, '')}`;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${dbName}`;
  const databaseUrl = url.toString();
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    JWT_SECRET,
    // Pin every auth setting so a developer's apps/api/.env cannot leak into the tests.
    JWT_EXPIRES_IN_SECONDS: '900',
    AUTH_SESSION_TTL_HOURS: '12',
    AUTH_COOKIE_SAMESITE: 'lax',
    AUTH_COOKIE_SECURE: 'false',
    CORS_ORIGINS: '',
    TRUST_PROXY: '0',
    ...env,
  });
  // Load app code only now: ConfigModule.forRoot() reads the environment when AppModule is first
  // imported, so a static import would pick up apps/api/.env (the dev database).
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { AppModule } = require('../../src/app.module') as typeof import('../../src/app.module');
  const { configureApp } = require('../../src/app.setup') as typeof import('../../src/app.setup');
  const { PrismaService } =
    require('../../src/prisma/prisma.service') as typeof import('../../src/prisma/prisma.service');
  const { Clock } = require('../../src/common/clock') as typeof import('../../src/common/clock');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const clock = new FakeClock();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue(clock)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  // Hard guard: never let a test write anywhere but the database created above.
  const prisma = app.get(PrismaService);
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`select current_database() as db`;
  if (db !== dbName) {
    await app.close();
    throw new Error(`e2e app connected to "${db}", expected "${dbName}"; refusing to run`);
  }
  return {
    app,
    clock,
    prisma,
    server: app.getHttpServer(),
    close: () => app.close(),
  };
}

let cachedHash: string | undefined;

export async function createUser(
  t: TestApp,
  data: { email: string; role?: 'ADMIN' | 'MANAGER' | 'STAFF'; isActive?: boolean; name?: string },
) {
  cachedHash ??= await hashPassword(PASSWORD);
  return t.prisma.user.create({
    data: {
      email: data.email,
      name: data.name ?? 'Test User',
      role: data.role ?? 'STAFF',
      isActive: data.isActive ?? true,
      passwordHash: cachedHash,
    },
  });
}

export interface LoggedIn {
  token: string;
  cookie: string;
  auth: { Authorization: string };
}

export async function login(t: TestApp, email: string, password = PASSWORD): Promise<LoggedIn> {
  const res = await request(t.server)
    .post('/api/v1/auth/login')
    .set(CSRF)
    .send({ email, password });
  if (res.status !== 200)
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  const setCookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
    c.startsWith('crm_refresh='),
  )!;
  return {
    token: res.body.accessToken,
    cookie: setCookie.split(';')[0],
    auth: { Authorization: `Bearer ${res.body.accessToken}` },
  };
}
