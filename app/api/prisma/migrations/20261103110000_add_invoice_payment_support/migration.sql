-- Soporte (imagen/PDF) y comentarios del pago de una venta, en tabla aparte para
-- no engordar los listados de facturas. Rollback: ROLLBACK.sql.
CREATE TABLE "InvoicePaymentSupport" (
  "id" SERIAL NOT NULL,
  "invoiceId" INTEGER NOT NULL,
  "notes" TEXT,
  "supportName" TEXT,
  "supportMimeType" TEXT,
  "supportData" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoicePaymentSupport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InvoicePaymentSupport_invoiceId_key" ON "InvoicePaymentSupport"("invoiceId");
ALTER TABLE "InvoicePaymentSupport" ADD CONSTRAINT "InvoicePaymentSupport_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
