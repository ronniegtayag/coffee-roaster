import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';
import { hashPassword } from './modules/auth/password';

/**
 * Creates the first admin from SEED_ADMIN_* env vars. Idempotent: an existing email is left
 * untouched (no password reset). Run with `pnpm api db:seed` (builds first, then runs dist/seed).
 */
async function seed(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file: rely on the real environment.
  }

  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.SEED_ADMIN_NAME?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !name || !password) {
    throw new Error(
      'Set SEED_ADMIN_EMAIL, SEED_ADMIN_NAME and SEED_ADMIN_PASSWORD to seed an admin.',
    );
  }
  if (!/^[\x21-\x7e]+$/.test(email)) {
    throw new Error('SEED_ADMIN_EMAIL must be ASCII only (no spaces or non-ASCII characters).');
  }
  if (password.length < 12) throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters.');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`Admin ${email} already exists; nothing to do.`);
      return;
    }
    await prisma.user.create({
      data: { email, name, passwordHash: await hashPassword(password), role: 'ADMIN' },
    });
    console.log(`Created admin ${email}.`);
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
