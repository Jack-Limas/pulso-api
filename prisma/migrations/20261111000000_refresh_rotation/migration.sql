-- Distinguishes a token replaced by rotation from one ended by logout.
ALTER TABLE "RefreshToken" ADD COLUMN "rotatedAt" TIMESTAMP(3);
