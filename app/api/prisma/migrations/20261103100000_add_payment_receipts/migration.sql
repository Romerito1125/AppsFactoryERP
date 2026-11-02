-- Lote 04 (ajuste 2): recibos de cobro/pago con número de documento, instrumentos,
-- soporte, edición y anulación. Solo agrega objetos nuevos y columnas con valor por defecto.
-- Rollback: ver ROLLBACK.sql.

CREATE TYPE "ReceiptKind" AS ENUM ('COBRO', 'PAGO');
CREATE TYPE "ReceiptStatus" AS ENUM ('VIGENTE', 'ANULADO');

CREATE TABLE "PaymentReceipt" (
  "id" SERIAL NOT NULL,
  "kind" "ReceiptKind" NOT NULL,
  "receiptNumber" TEXT NOT NULL,
  "documentNumber" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "clientId" INTEGER,
  "providerId" INTEGER,
  "paidAt" TIMESTAMP(3) NOT NULL,
  "totalAmount" DECIMAL(14,2) NOT NULL,
  "cashAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "retentionTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "instruments" JSONB NOT NULL DEFAULT '[]',
  "allocations" JSONB NOT NULL DEFAULT '[]',
  "comments" TEXT,
  "operationType" TEXT,
  "sellerName" TEXT,
  "supportName" TEXT,
  "supportMimeType" TEXT,
  "supportData" TEXT,
  "status" "ReceiptStatus" NOT NULL DEFAULT 'VIGENTE',
  "voidedAt" TIMESTAMP(3),
  "voidReason" TEXT,
  "createdByUserId" INTEGER,
  "createdByUsername" TEXT,
  "updatedByUserId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentReceipt_receiptNumber_key" ON "PaymentReceipt"("receiptNumber");
CREATE UNIQUE INDEX "PaymentReceipt_kind_documentNumber_key" ON "PaymentReceipt"("kind", "documentNumber");
CREATE INDEX "PaymentReceipt_clientId_idx" ON "PaymentReceipt"("clientId");
CREATE INDEX "PaymentReceipt_providerId_idx" ON "PaymentReceipt"("providerId");
CREATE INDEX "PaymentReceipt_paidAt_idx" ON "PaymentReceipt"("paidAt");

ALTER TABLE "CreditPayment"
  ADD COLUMN "receiptId" INTEGER,
  ADD COLUMN "retention" DECIMAL(12,2) NOT NULL DEFAULT 0;
CREATE INDEX "CreditPayment_receiptId_idx" ON "CreditPayment"("receiptId");
ALTER TABLE "CreditPayment" ADD CONSTRAINT "CreditPayment_receiptId_fkey"
  FOREIGN KEY ("receiptId") REFERENCES "PaymentReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
