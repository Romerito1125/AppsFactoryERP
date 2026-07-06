ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CAJERO';

CREATE TYPE "NotificationType" AS ENUM ('FACTURA', 'VENTA_POS', 'PEDIDO_APP');

ALTER TABLE "Invoice"
ADD COLUMN "createdByUserId" INTEGER,
ADD COLUMN "createdByRole" "Role",
ADD COLUMN "createdByUsername" TEXT;

CREATE TABLE "Notification" (
  "id" SERIAL NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "source" "InvoiceSource",
  "invoiceId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Invoice_createdByUserId_idx" ON "Invoice"("createdByUserId");
CREATE INDEX "Invoice_createdByRole_idx" ON "Invoice"("createdByRole");
CREATE INDEX "Notification_type_idx" ON "Notification"("type");
CREATE INDEX "Notification_source_idx" ON "Notification"("source");
CREATE INDEX "Notification_invoiceId_idx" ON "Notification"("invoiceId");
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

ALTER TABLE "Invoice"
ADD CONSTRAINT "Invoice_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_invoiceId_fkey"
FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
DECLARE
  admin_user_id INTEGER;
  admin_username TEXT;
BEGIN
  SELECT "id", "username"
  INTO admin_user_id, admin_username
  FROM "User"
  WHERE "role" = 'ADMIN'
  ORDER BY "id"
  LIMIT 1;

  UPDATE "Invoice"
  SET
    "createdByUserId" = CASE
      WHEN "source" = 'APP_MOVIL' THEN NULL
      ELSE admin_user_id
    END,
    "createdByRole" = CASE
      WHEN "source" = 'APP_MOVIL' THEN NULL
      ELSE 'ADMIN'::"Role"
    END,
    "createdByUsername" = CASE
      WHEN "source" = 'APP_MOVIL' THEN NULL
      ELSE COALESCE(admin_username, 'sistema')
    END
  WHERE "createdByRole" IS NULL;
END $$;
