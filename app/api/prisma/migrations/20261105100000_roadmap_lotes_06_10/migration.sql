-- Lotes 06-10 del roadmap: vendedor/cajero, borradores, condiciones comerciales de compra,
-- preventas con surtido por bodega y 4x1000 automático. Solo columnas con valor por defecto
-- y una tabla nueva. Rollback: ROLLBACK.sql.

ALTER TABLE "Invoice"
  ADD COLUMN "sellerUserId" INTEGER,
  ADD COLUMN "sellerUsername" TEXT;

ALTER TABLE "PurchaseOrder"
  ADD COLUMN "discount1Percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "discount2Percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "freight" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "retentionBase" DECIMAL(14,2),
  ADD COLUMN "retentionBaseReason" TEXT,
  ADD COLUMN "retentionBaseEditedBy" TEXT,
  ADD COLUMN "paymentCondition" TEXT NOT NULL DEFAULT 'CREDITO',
  ADD COLUMN "invoiceDate" TIMESTAMP(3),
  ADD COLUMN "dueDate" TIMESTAMP(3),
  ADD COLUMN "operationType" TEXT,
  ADD COLUMN "purchaseOrderRef" TEXT;

ALTER TABLE "Quote"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'COTIZACION',
  ADD COLUMN "sellerUserId" INTEGER,
  ADD COLUMN "sellerUsername" TEXT;

ALTER TABLE "QuoteItem"
  ADD COLUMN "warehouseId" INTEGER,
  ADD COLUMN "fulfillmentStatus" TEXT NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN "fulfilledAt" TIMESTAMP(3),
  ADD COLUMN "fulfilledByUsername" TEXT;

ALTER TABLE "BankAccount" ADD COLUMN "autoGmf" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "DocumentDraft" (
  "id" SERIAL NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "userId" INTEGER NOT NULL,
  "username" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentDraft_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DocumentDraft_userId_kind_idx" ON "DocumentDraft"("userId", "kind");
CREATE INDEX "DocumentDraft_kind_idx" ON "DocumentDraft"("kind");
