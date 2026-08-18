-- Assigns internal staff to a warehouse, tracks per-line warehouse stock,
-- separates seller invoice validation, and records the generation 4 social fund.
ALTER TABLE "User" ADD COLUMN "warehouseId" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "validationStatus" TEXT NOT NULL DEFAULT 'VALIDADA';
ALTER TABLE "Invoice" ADD COLUMN "validatedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "validatedByUserId" INTEGER;
ALTER TABLE "InvoiceItem" ADD COLUMN "warehouseId" INTEGER;
ALTER TABLE "ReferralProfitPolicy" ADD COLUMN "isSocialWork" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "InvoiceValidationStatus" AS ENUM ('PENDIENTE', 'VALIDADA', 'RECHAZADA');
ALTER TABLE "Invoice" ALTER COLUMN "validationStatus" DROP DEFAULT;
ALTER TABLE "Invoice" ALTER COLUMN "validationStatus" TYPE "InvoiceValidationStatus" USING "validationStatus"::"InvoiceValidationStatus";
ALTER TABLE "Invoice" ALTER COLUMN "validationStatus" SET DEFAULT 'VALIDADA';

CREATE TYPE "NotificationType_new" AS ENUM ('FACTURA', 'VENTA_POS', 'PEDIDO_APP', 'OBRA_SOCIAL');
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType_new" USING "type"::text::"NotificationType_new";
DROP TYPE "NotificationType";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";

CREATE TABLE "ReferralSocialContribution" (
  "id" SERIAL NOT NULL,
  "buyerClientId" INTEGER NOT NULL,
  "originInvoiceId" INTEGER NOT NULL,
  "generation" INTEGER NOT NULL DEFAULT 4,
  "baseProfit" DECIMAL(12,2) NOT NULL,
  "percentage" DECIMAL(5,2) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralSocialContribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferralSocialContribution_buyerClientId_originInvoiceId_generation_key" ON "ReferralSocialContribution"("buyerClientId", "originInvoiceId", "generation");
CREATE INDEX "ReferralSocialContribution_buyerClientId_idx" ON "ReferralSocialContribution"("buyerClientId");
CREATE INDEX "ReferralSocialContribution_originInvoiceId_idx" ON "ReferralSocialContribution"("originInvoiceId");
CREATE INDEX "ReferralSocialContribution_createdAt_idx" ON "ReferralSocialContribution"("createdAt");
CREATE INDEX "User_warehouseId_idx" ON "User"("warehouseId");
CREATE INDEX "Invoice_validatedByUserId_idx" ON "Invoice"("validatedByUserId");
CREATE INDEX "Invoice_validationStatus_idx" ON "Invoice"("validationStatus");
CREATE INDEX "InvoiceItem_warehouseId_idx" ON "InvoiceItem"("warehouseId");

ALTER TABLE "User" ADD CONSTRAINT "User_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_validatedByUserId_fkey" FOREIGN KEY ("validatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReferralSocialContribution" ADD CONSTRAINT "ReferralSocialContribution_buyerClientId_fkey" FOREIGN KEY ("buyerClientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralSocialContribution" ADD CONSTRAINT "ReferralSocialContribution_originInvoiceId_fkey" FOREIGN KEY ("originInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "ReferralProfitPolicy" SET "isSocialWork" = true WHERE "generation" = 4;
