-- Una factura puede recibir varios abonos y cada abono puede generar
-- su propio movimiento bancario. La trazabilidad se conserva mediante
-- invoiceId sin imponer una relación uno a uno con el movimiento bancario.
DROP INDEX IF EXISTS "BankAccountMovement_invoiceId_key";

CREATE INDEX IF NOT EXISTS "BankAccountMovement_invoiceId_idx"
  ON "BankAccountMovement"("invoiceId");
