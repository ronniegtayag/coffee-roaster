import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, UserRole } from './generated/prisma/client';
import { hashPassword } from './modules/auth/password';

const DEV_USERS: { email: string; name: string; role: UserRole }[] = [
  { email: 'admin@example.com', name: 'Dev Admin', role: 'ADMIN' },
  { email: 'manager@example.com', name: 'Dev Manager', role: 'MANAGER' },
  { email: 'staff@example.com', name: 'Dev Staff', role: 'STAFF' },
];

/**
 * Dev only: creates one account per role, sharing the password in DEV_SEED_PASSWORD.
 * Unlike the admin seed this does NOT enforce the 12-character minimum, so never use it on a
 * real database. Idempotent: an existing email is left untouched. Run `pnpm api db:seed:dev`.
 */
async function seedDev(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file: rely on the real environment.
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the dev seed when NODE_ENV=production.');
  }
  const password = process.env.DEV_SEED_PASSWORD;
  if (!password) throw new Error('Set DEV_SEED_PASSWORD to seed the dev accounts.');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const passwordHash = await hashPassword(password);
    for (const user of DEV_USERS) {
      const existing = await prisma.user.findUnique({ where: { email: user.email } });
      if (existing) {
        console.log(`${user.email} already exists; left untouched.`);
        continue;
      }
      await prisma.user.create({ data: { ...user, passwordHash } });
      console.log(`Created ${user.role} ${user.email}.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

seedDev().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
