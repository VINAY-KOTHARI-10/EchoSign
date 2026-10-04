-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "study_notes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "classCode" VARCHAR(6),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "study_notes_userId_updatedAt_idx" ON "study_notes"("userId", "updatedAt");

