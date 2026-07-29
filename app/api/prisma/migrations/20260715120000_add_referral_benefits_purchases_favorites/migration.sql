-- Historical purchase documents, configurable referral profit sharing and persisted favorites.
CREATE TYPE "ReferralBenefitStatus" AS ENUM ('DISPONIBLE', 'USADO', 'ANULADO');
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('BORRADOR', 'ORDENADA', 'RECIBIDA', 'ANULADA');

ALTER TABLE "Invoice" ADD COLUMN "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "referralDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "InvoiceItem" ADD COLUMN "grossSubtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "unitCost" DECIMAL(12,2),
ADD COLUMN "profitAmount" DECIMAL(12,2);

UPDATE "InvoiceItem" SET "grossSubtotal" = "subtotal";

CREATE TABLE "ProductFavorite" (
  "userId" INTEGER NOT NULL,
  "productId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductFavorite_pkey" PRIMARY KEY ("userId", "productId")
);

CREATE TABLE "ReferralProfitPolicy" (
  "id" SERIAL NOT NULL,
  "generation" INTEGER NOT NULL,
  "percentage" DECIMAL(5,2) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralProfitPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReferralBenefit" (
  "id" SERIAL NOT NULL,
  "beneficiaryClientId" INTEGER NOT NULL,
  "buyerClientId" INTEGER NOT NULL,
  "originInvoiceId" INTEGER NOT NULL,
  "generation" INTEGER NOT NULL,
  "baseProfit" DECIMAL(12,2) NOT NULL,
  "percentage" DECIMAL(5,2) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "remainingAmount" DECIMAL(12,2) NOT NULL,
  "status" "ReferralBenefitStatus" NOT NULL DEFAULT 'DISPONIBLE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralBenefit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReferralBenefitRedemption" (
  "id" SERIAL NOT NULL,
  "benefitId" INTEGER NOT NULL,
  "invoiceId" INTEGER NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralBenefitRedemption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseOrder" (
  "id" SERIAL NOT NULL,
  "consecutive" TEXT NOT NULL,
  "providerId" INTEGER NOT NULL,
  "warehouseId" INTEGER NOT NULL,
  "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'BORRADOR',
  "externalReference" TEXT,
  "notes" TEXT,
  "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expectedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "subtotal" DECIMAL(14,2) NOT NULL,
  "taxes" DECIMAL(14,2) NOT NULL,
  "total" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseOrderItem" (
  "id" SERIAL NOT NULL,
  "purchaseOrderId" INTEGER NOT NULL,
  "productId" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
  "unit" "UnitType" NOT NULL DEFAULT 'UND',
  "unitCost" DECIMAL(12,2) NOT NULL,
  "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "subtotal" DECIMAL(14,2) NOT NULL,
  "taxAmount" DECIMAL(14,2) NOT NULL,
  "total" DECIMAL(14,2) NOT NULL,
  CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "InventoryMovement" ADD COLUMN "purchaseOrderItemId" INTEGER;
ALTER TABLE "ProductCost" ADD COLUMN "purchaseOrderItemId" INTEGER;

CREATE UNIQUE INDEX "ReferralProfitPolicy_generation_key" ON "ReferralProfitPolicy"("generation");
CREATE UNIQUE INDEX "ReferralBenefit_beneficiaryClientId_originInvoiceId_generation_key" ON "ReferralBenefit"("beneficiaryClientId", "originInvoiceId", "generation");
CREATE UNIQUE INDEX "PurchaseOrder_consecutive_key" ON "PurchaseOrder"("consecutive");
CREATE INDEX "ProductFavorite_productId_idx" ON "ProductFavorite"("productId");
CREATE INDEX "ReferralProfitPolicy_isActive_idx" ON "ReferralProfitPolicy"("isActive");
CREATE INDEX "ReferralBenefit_beneficiaryClientId_status_idx" ON "ReferralBenefit"("beneficiaryClientId", "status");
CREATE INDEX "ReferralBenefit_buyerClientId_idx" ON "ReferralBenefit"("buyerClientId");
CREATE INDEX "ReferralBenefit_originInvoiceId_idx" ON "ReferralBenefit"("originInvoiceId");
CREATE INDEX "ReferralBenefitRedemption_benefitId_idx" ON "ReferralBenefitRedemption"("benefitId");
CREATE INDEX "ReferralBenefitRedemption_invoiceId_idx" ON "ReferralBenefitRedemption"("invoiceId");
CREATE INDEX "PurchaseOrder_providerId_idx" ON "PurchaseOrder"("providerId");
CREATE INDEX "PurchaseOrder_warehouseId_idx" ON "PurchaseOrder"("warehouseId");
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");
CREATE INDEX "PurchaseOrder_orderedAt_idx" ON "PurchaseOrder"("orderedAt");
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");
CREATE INDEX "PurchaseOrderItem_productId_idx" ON "PurchaseOrderItem"("productId");
CREATE INDEX "InventoryMovement_purchaseOrderItemId_idx" ON "InventoryMovement"("purchaseOrderItemId");
CREATE INDEX "ProductCost_purchaseOrderItemId_idx" ON "ProductCost"("purchaseOrderItemId");

ALTER TABLE "ProductFavorite" ADD CONSTRAINT "ProductFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductFavorite" ADD CONSTRAINT "ProductFavorite_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralBenefit" ADD CONSTRAINT "ReferralBenefit_beneficiaryClientId_fkey" FOREIGN KEY ("beneficiaryClientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralBenefit" ADD CONSTRAINT "ReferralBenefit_buyerClientId_fkey" FOREIGN KEY ("buyerClientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralBenefit" ADD CONSTRAINT "ReferralBenefit_originInvoiceId_fkey" FOREIGN KEY ("originInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralBenefitRedemption" ADD CONSTRAINT "ReferralBenefitRedemption_benefitId_fkey" FOREIGN KEY ("benefitId") REFERENCES "ReferralBenefit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralBenefitRedemption" ADD CONSTRAINT "ReferralBenefitRedemption_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductCost" ADD CONSTRAINT "ProductCost_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "ReferralProfitPolicy" ("generation", "percentage", "isActive", "updatedAt") VALUES
  (1, 10.00, true, CURRENT_TIMESTAMP),
  (2, 5.00, true, CURRENT_TIMESTAMP),
  (3, 2.00, true, CURRENT_TIMESTAMP);
