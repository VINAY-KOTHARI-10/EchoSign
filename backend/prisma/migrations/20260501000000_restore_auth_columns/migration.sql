-- Restores the OAuth / email-verification / password-reset columns that
-- 20260413054631_init dropped, so the database matches schema.prisma again.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "avatar" TEXT,
  ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "emailVerifyExpires" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "emailVerifyToken" TEXT,
  ADD COLUMN IF NOT EXISTS "googleId" TEXT,
  ADD COLUMN IF NOT EXISTS "passwordResetExpires" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "passwordResetToken" TEXT,
  ALTER COLUMN "passwordHash" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "users_googleId_key" ON "users"("googleId");
