CREATE TYPE "InvoiceSource" AS ENUM ('ADMIN', 'POS', 'APP_MOVIL');

ALTER TABLE "Invoice"
ADD COLUMN "source" "InvoiceSource" NOT NULL DEFAULT 'ADMIN';
