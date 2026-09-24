ALTER TABLE "Provider"
  ADD COLUMN "withholdingRate" DECIMAL(5,2),
  ADD COLUMN "withholdingMinimumBase" DECIMAL(14,2),
  ADD COLUMN "isSelfWithholding" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "PurchaseOrder"
  ADD COLUMN "retentionRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "retentionAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "payableTotal" DECIMAL(14,2) NOT NULL DEFAULT 0;

UPDATE "PurchaseOrder"
SET "payableTotal" = "total"
WHERE "payableTotal" = 0 AND "total" <> 0;
