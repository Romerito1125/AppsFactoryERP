ALTER TABLE "InvoiceCredit" ADD COLUMN "clientId" INTEGER;

UPDATE "InvoiceCredit" ic
SET "clientId" = i."clientId"
FROM "Invoice" i
WHERE ic."invoiceId" = i."id";

ALTER TABLE "InvoiceCredit"
ALTER COLUMN "clientId" SET NOT NULL,
ALTER COLUMN "invoiceId" DROP NOT NULL;

ALTER TABLE "InvoiceCredit"
ADD CONSTRAINT "InvoiceCredit_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "InvoiceCredit_clientId_idx" ON "InvoiceCredit"("clientId");
