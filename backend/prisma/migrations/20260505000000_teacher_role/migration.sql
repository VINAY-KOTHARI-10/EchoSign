-- Role hierarchy: ADMIN > TEACHER > USER (member). Teachers can start classes.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'TEACHER';
