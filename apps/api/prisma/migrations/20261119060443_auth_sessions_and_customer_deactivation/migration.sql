-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "deactivatedAt" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "deactivatedAt" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "lastUsedAt" TIMESTAMPTZ(6),
    "userAgent" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_tokenHash_key" ON "auth_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions"("userId");

-- CreateIndex
CREATE INDEX "auth_sessions_expiresAt_idx" ON "auth_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "branches_state_idx" ON "branches"("state");

-- CreateIndex
CREATE INDEX "customers_isActive_idx" ON "customers"("isActive");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Hand-written: CHECK constraints (Prisma does not model or drop these) ─────

-- Case-insensitive login (brief A1): emails are stored trimmed and lower-cased,
-- so the existing unique index on "email" is effectively case-insensitive.
UPDATE "users" SET "email" = lower(btrim("email")) WHERE "email" <> lower(btrim("email"));
ALTER TABLE "users" ADD CONSTRAINT "users_email_normalised_chk" CHECK ("email" = lower(btrim("email")));

-- ABN is stored as exactly 11 digits, no spaces (D-PO-1). The checksum is enforced in the API.
ALTER TABLE "customers" ADD CONSTRAINT "customers_abn_format_chk" CHECK ("abn" IS NULL OR "abn" ~ '^[0-9]{11}$');

-- Australian postcodes are 4 digits, kept as text so leading zeros survive (brief E1).
ALTER TABLE "branches" ADD CONSTRAINT "branches_postcode_format_chk" CHECK ("postcode" ~ '^[0-9]{4}$');
