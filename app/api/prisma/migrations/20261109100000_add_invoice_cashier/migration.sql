ALTER TABLE "Invoice"
  ADD COLUMN "cashierUserId" INTEGER,
  ADD COLUMN "cashierUsername" TEXT;

CREATE INDEX "Invoice_cashierUserId_idx" ON "Invoice"("cashierUserId");

ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_cashierUserId_fkey"
  FOREIGN KEY ("cashierUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
