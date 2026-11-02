-- Notas de débito/crédito y anticipos de cuentas por cobrar y por pagar.
-- Solo agrega objetos nuevos. Rollback: ROLLBACK.sql.
CREATE TYPE "AccountSide" AS ENUM ('COBRAR', 'PAGAR');
CREATE TYPE "NoteKind" AS ENUM ('DEBITO', 'CREDITO', 'ANTICIPO');

CREATE TABLE "AccountNote" (
  "id" SERIAL NOT NULL,
  "side" "AccountSide" NOT NULL,
  "kind" "NoteKind" NOT NULL,
  "documentNumber" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "clientId" INTEGER,
  "providerId" INTEGER,
  "creditId" INTEGER,
  "purchaseOrderId" INTEGER,
  "amount" DECIMAL(14,2) NOT NULL,
  "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueDate" TIMESTAMP(3),
  "bankAccountId" INTEGER,
  "advanceNoteId" INTEGER,
  "status" "ReceiptStatus" NOT NULL DEFAULT 'VIGENTE',
  "voidedAt" TIMESTAMP(3),
  "voidReason" TEXT,
  "createdByUserId" INTEGER,
  "createdByUsername" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountNote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountNote_side_kind_documentNumber_key" ON "AccountNote"("side", "kind", "documentNumber");
CREATE INDEX "AccountNote_clientId_idx" ON "AccountNote"("clientId");
CREATE INDEX "AccountNote_providerId_idx" ON "AccountNote"("providerId");
CREATE INDEX "AccountNote_creditId_idx" ON "AccountNote"("creditId");
CREATE INDEX "AccountNote_purchaseOrderId_idx" ON "AccountNote"("purchaseOrderId");
CREATE INDEX "AccountNote_advanceNoteId_idx" ON "AccountNote"("advanceNoteId");
