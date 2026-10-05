-- Existing accounts retain legacy-token compatibility until their password changes.
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
