ALTER TABLE "Client" ADD COLUMN "neighborhood" TEXT;
ALTER TABLE "Client" ADD COLUMN "referencePoint" TEXT;
ALTER TABLE "Client" ADD COLUMN "priceLevel" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "InventoryTransferTicket" ADD COLUMN "batchNumber" TEXT;
CREATE INDEX "InventoryTransferTicket_batchNumber_idx" ON "InventoryTransferTicket"("batchNumber");
