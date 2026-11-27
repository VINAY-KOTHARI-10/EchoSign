-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "teachingLanguages" TEXT[] DEFAULT ARRAY[]::TEXT[];

