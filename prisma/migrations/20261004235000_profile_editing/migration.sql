ALTER TABLE "User"
  ADD COLUMN "banner" TEXT,
  ADD COLUMN "website" TEXT,
  ADD COLUMN "dateOfBirth" DATE,
  ADD COLUMN "dateOfBirthChangedAt" TIMESTAMP(3),
  ADD COLUMN "countryChangedAt" TIMESTAMP(3);
