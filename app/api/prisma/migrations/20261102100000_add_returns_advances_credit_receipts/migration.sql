-- Lotes 04 y 05: anticipos/saldos a favor, comprobantes de abonos y devoluciones parciales.
-- Solo agrega objetos nuevos y columnas opcionales: no modifica ni elimina datos existentes.
-- Rollback: ver ROLLBACK.sql en esta misma carpeta.

CREATE TYPE "AdvanceStatus" AS ENUM ('DISPONIBLE', 'APLICADO', 'DEVUELTO');
CREATE TYPE "AdvanceSource" AS ENUM ('ANTICIPO', 'DEVOLUCION');
CREATE TYPE "ReturnRefundMethod" AS ENUM ('CUENTA', 'SALDO_FAVOR');

ALTER TABLE "CreditPayment"
  ADD COLUMN "receiptNumber" TEXT,
  ADD COLUMN "reference" TEXT,
  ADD COLUMN "supportName" TEXT,
  ADD COLUMN "supportMimeType" TEXT,
  ADD COLUMN "supportData" TEXT,
  ADD COLUMN "createdByUserId" INTEGER,
  ADD COLUMN "advanceId" INTEGER;

CREATE UNIQUE INDEX "CreditPayment_receiptNumber_key" ON "CreditPayment"("receiptNumber");
CREATE INDEX "CreditPayment_advanceId_idx" ON "CreditPayment"("advanceId");

CREATE TABLE "ClientAdvance" (
  "id" SERIAL NOT NULL,
  "consecutive" TEXT NOT NULL,
  "clientId" INTEGER NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "appliedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "balance" DECIMAL(14,2) NOT NULL,
  "status" "AdvanceStatus" NOT NULL DEFAULT 'DISPONIBLE',
  "source" "AdvanceSource" NOT NULL DEFAULT 'ANTICIPO',
  "bankMovementId" INTEGER,
  "saleReturnId" INTEGER,
  "notes" TEXT,
  "createdByUserId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientAdvance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClientAdvance_consecutive_key" ON "ClientAdvance"("consecutive");
CREATE INDEX "ClientAdvance_clientId_idx" ON "ClientAdvance"("clientId");
CREATE INDEX "ClientAdvance_status_idx" ON "ClientAdvance"("status");
CREATE INDEX "ClientAdvance_saleReturnId_idx" ON "ClientAdvance"("saleReturnId");
ALTER TABLE "ClientAdvance" ADD CONSTRAINT "ClientAdvance_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SaleReturn" (
  "id" SERIAL NOT NULL,
  "consecutive" TEXT NOT NULL,
  "invoiceId" INTEGER NOT NULL,
  "clientId" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "notes" TEXT,
  "subtotal" DECIMAL(12,2) NOT NULL,
  "taxes" DECIMAL(12,2) NOT NULL,
  "total" DECIMAL(12,2) NOT NULL,
  "creditApplied" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "advanceAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "refundMethod" "ReturnRefundMethod",
  "bankAccountId" INTEGER,
  "createdByUserId" INTEGER,
  "createdByUsername" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SaleReturn_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SaleReturn_consecutive_key" ON "SaleReturn"("consecutive");
CREATE INDEX "SaleReturn_invoiceId_idx" ON "SaleReturn"("invoiceId");
CREATE INDEX "SaleReturn_clientId_idx" ON "SaleReturn"("clientId");
CREATE INDEX "SaleReturn_createdAt_idx" ON "SaleReturn"("createdAt");
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SaleReturnItem" (
  "id" SERIAL NOT NULL,
  "returnId" INTEGER NOT NULL,
  "invoiceItemId" INTEGER NOT NULL,
  "productId" INTEGER NOT NULL,
  "warehouseId" INTEGER,
  "quantity" DECIMAL(12,3) NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "taxRate" DECIMAL(5,2) NOT NULL,
  "subtotal" DECIMAL(12,2) NOT NULL,
  "taxAmount" DECIMAL(12,2) NOT NULL,
  "total" DECIMAL(12,2) NOT NULL,
  "restocked" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "SaleReturnItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SaleReturnItem_returnId_idx" ON "SaleReturnItem"("returnId");
CREATE INDEX "SaleReturnItem_invoiceItemId_idx" ON "SaleReturnItem"("invoiceItemId");
CREATE INDEX "SaleReturnItem_productId_idx" ON "SaleReturnItem"("productId");
ALTER TABLE "SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_returnId_fkey"
  FOREIGN KEY ("returnId") REFERENCES "SaleReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_invoiceItemId_fkey"
  FOREIGN KEY ("invoiceItemId") REFERENCES "InvoiceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
