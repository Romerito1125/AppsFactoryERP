ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DOMICILIARIO';

ALTER TABLE "Delivery"
  ADD COLUMN IF NOT EXISTS "assignedUserId" INTEGER,
  ADD COLUMN IF NOT EXISTS "deliveryFee" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "Delivery"
  ADD CONSTRAINT "Delivery_assignedUserId_fkey"
  FOREIGN KEY ("assignedUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Delivery_assignedUserId_idx"
  ON "Delivery"("assignedUserId");

ALTER TABLE "BankAccount"
  ADD COLUMN IF NOT EXISTS "gmfRate" DECIMAL(8,5) NOT NULL DEFAULT 0.4;

UPDATE "BankAccount"
SET "gmfRate" = 0.4
WHERE "gmfRate" IS NULL OR "gmfRate" <= 0;
