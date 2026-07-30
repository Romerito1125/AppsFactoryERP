CREATE TYPE "SaleMode" AS ENUM ('CONTADO', 'CREDITO');

ALTER TABLE "Invoice"
ADD COLUMN "warehouseId" integer,
ADD COLUMN "saleMode" "SaleMode" NOT NULL DEFAULT 'CONTADO',
ADD COLUMN "zone" text,
ADD COLUMN "city" text,
ADD COLUMN "station" text;

ALTER TABLE "BankAccountMovement"
ADD COLUMN "baseAmount" decimal(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "gmfRate" decimal(8,5) NOT NULL DEFAULT 0,
ADD COLUMN "gmfAmount" decimal(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "totalAmount" decimal(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "appliesGmf" boolean NOT NULL DEFAULT false;

UPDATE "BankAccountMovement"
SET
  "baseAmount" = "amount",
  "totalAmount" = "amount",
  "gmfRate" = 0,
  "gmfAmount" = 0,
  "appliesGmf" = false;

CREATE INDEX "Invoice_warehouseId_idx" ON "Invoice"("warehouseId");

ALTER TABLE "Invoice"
ADD CONSTRAINT "Invoice_warehouseId_fkey"
FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
