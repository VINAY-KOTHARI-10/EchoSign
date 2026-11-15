-- Additive only: nothing is dropped or rewritten, so existing data is untouched.

-- Idempotent captions: a retried send carries the same clientId and is stored once.
ALTER TABLE "captions" ADD COLUMN "clientId" TEXT;
CREATE UNIQUE INDEX "captions_classroomId_clientId_key" ON "captions"("classroomId", "clientId");
CREATE INDEX "captions_classroomId_speakerId_idx" ON "captions"("classroomId", "speakerId");

-- Attendance: last departure and reconnection count.
ALTER TABLE "classroom_members" ADD COLUMN "lastLeftAt" TIMESTAMP(3);
ALTER TABLE "classroom_members" ADD COLUMN "reconnects" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "classroom_members_userId_idx" ON "classroom_members"("userId");

-- Faster "active classes" and history queries.
CREATE INDEX "classrooms_active_createdAt_idx" ON "classrooms"("active", "createdAt");

-- Audit log (append-only).
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "meta" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
