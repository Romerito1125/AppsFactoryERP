-- Solo ejecutar manualmente (no es parte de `migrate deploy`) y con respaldo previo.
DROP TABLE IF EXISTS "SaleReturnItem";
DROP TABLE IF EXISTS "SaleReturn";
DROP TABLE IF EXISTS "ClientAdvance";
ALTER TABLE "CreditPayment"
  DROP COLUMN IF EXISTS "receiptNumber", DROP COLUMN IF EXISTS "reference",
  DROP COLUMN IF EXISTS "supportName", DROP COLUMN IF EXISTS "supportMimeType",
  DROP COLUMN IF EXISTS "supportData", DROP COLUMN IF EXISTS "createdByUserId",
  DROP COLUMN IF EXISTS "advanceId";
DROP TYPE IF EXISTS "ReturnRefundMethod";
DROP TYPE IF EXISTS "AdvanceSource";
DROP TYPE IF EXISTS "AdvanceStatus";
