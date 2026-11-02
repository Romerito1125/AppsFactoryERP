-- Solo ejecutar manualmente y con respaldo previo.
DROP TABLE IF EXISTS "DocumentDraft";
ALTER TABLE "BankAccount" DROP COLUMN IF EXISTS "autoGmf";
ALTER TABLE "QuoteItem" DROP COLUMN IF EXISTS "warehouseId", DROP COLUMN IF EXISTS "fulfillmentStatus",
  DROP COLUMN IF EXISTS "fulfilledAt", DROP COLUMN IF EXISTS "fulfilledByUsername";
ALTER TABLE "Quote" DROP COLUMN IF EXISTS "kind", DROP COLUMN IF EXISTS "sellerUserId", DROP COLUMN IF EXISTS "sellerUsername";
ALTER TABLE "PurchaseOrder" DROP COLUMN IF EXISTS "discount1Percent", DROP COLUMN IF EXISTS "discount2Percent",
  DROP COLUMN IF EXISTS "freight", DROP COLUMN IF EXISTS "retentionBase", DROP COLUMN IF EXISTS "retentionBaseReason",
  DROP COLUMN IF EXISTS "retentionBaseEditedBy", DROP COLUMN IF EXISTS "paymentCondition", DROP COLUMN IF EXISTS "invoiceDate",
  DROP COLUMN IF EXISTS "dueDate", DROP COLUMN IF EXISTS "operationType", DROP COLUMN IF EXISTS "purchaseOrderRef";
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "sellerUserId", DROP COLUMN IF EXISTS "sellerUsername";
