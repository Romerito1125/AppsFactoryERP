-- Solo ejecutar manualmente y con respaldo previo.
ALTER TABLE "CreditPayment" DROP CONSTRAINT IF EXISTS "CreditPayment_receiptId_fkey";
DROP INDEX IF EXISTS "CreditPayment_receiptId_idx";
ALTER TABLE "CreditPayment" DROP COLUMN IF EXISTS "receiptId", DROP COLUMN IF EXISTS "retention";
DROP TABLE IF EXISTS "PaymentReceipt";
DROP TYPE IF EXISTS "ReceiptStatus";
DROP TYPE IF EXISTS "ReceiptKind";
