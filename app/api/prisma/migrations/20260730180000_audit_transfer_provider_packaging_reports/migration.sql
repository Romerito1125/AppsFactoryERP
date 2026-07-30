CREATE TYPE "TransferTicketStatus" AS ENUM ('PENDIENTE', 'APROBADO', 'CANCELADO');

ALTER TABLE "InventoryMovement"
ADD COLUMN "createdByUserId" integer,
ADD COLUMN "approvedByUserId" integer,
ADD COLUMN "approvedAt" timestamp(3),
ADD COLUMN "packagingBoxes" integer,
ADD COLUMN "packagingPackages" integer,
ADD COLUMN "packagingUnits" integer;

ALTER TABLE "Provider"
ADD COLUMN "taxId" text,
ADD COLUMN "providerType" text,
ADD COLUMN "address" text,
ADD COLUMN "country" text,
ADD COLUMN "city" text,
ADD COLUMN "phonePrimary" text,
ADD COLUMN "phoneSecondary" text,
ADD COLUMN "email" text,
ADD COLUMN "legalRepresentative" text;

CREATE TABLE "InventoryTransferTicket" (
  "id" serial NOT NULL,
  "movementId" integer NOT NULL,
  "ticketNumber" text NOT NULL,
  "status" "TransferTicketStatus" NOT NULL DEFAULT 'APROBADO',
  "supportNote" text,
  "createdByUserId" integer,
  "approvedByUserId" integer,
  "approvedAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InventoryTransferTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductPackagingProfile" (
  "id" serial NOT NULL,
  "productId" integer NOT NULL,
  "unitsPerPackage" integer,
  "packagesPerBox" integer,
  "saleByUnitOnly" boolean NOT NULL DEFAULT false,
  "notes" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProductPackagingProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" serial NOT NULL,
  "userId" integer,
  "username" text,
  "userRole" "Role",
  "module" text NOT NULL,
  "action" text NOT NULL,
  "entityType" text,
  "entityId" integer,
  "entityLabel" text,
  "description" text,
  "metadata" jsonb,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Provider_taxId_key" ON "Provider"("taxId");
CREATE UNIQUE INDEX "InventoryTransferTicket_movementId_key" ON "InventoryTransferTicket"("movementId");
CREATE UNIQUE INDEX "InventoryTransferTicket_ticketNumber_key" ON "InventoryTransferTicket"("ticketNumber");
CREATE INDEX "InventoryTransferTicket_status_idx" ON "InventoryTransferTicket"("status");
CREATE INDEX "InventoryTransferTicket_createdByUserId_idx" ON "InventoryTransferTicket"("createdByUserId");
CREATE INDEX "InventoryTransferTicket_approvedByUserId_idx" ON "InventoryTransferTicket"("approvedByUserId");
CREATE INDEX "InventoryTransferTicket_createdAt_idx" ON "InventoryTransferTicket"("createdAt");
CREATE UNIQUE INDEX "ProductPackagingProfile_productId_key" ON "ProductPackagingProfile"("productId");
CREATE INDEX "InventoryMovement_createdByUserId_idx" ON "InventoryMovement"("createdByUserId");
CREATE INDEX "InventoryMovement_approvedByUserId_idx" ON "InventoryMovement"("approvedByUserId");
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");
CREATE INDEX "AuditLog_module_createdAt_idx" ON "AuditLog"("module", "createdAt");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

ALTER TABLE "InventoryMovement"
ADD CONSTRAINT "InventoryMovement_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement"
ADD CONSTRAINT "InventoryMovement_approvedByUserId_fkey"
FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryTransferTicket"
ADD CONSTRAINT "InventoryTransferTicket_movementId_fkey"
FOREIGN KEY ("movementId") REFERENCES "InventoryMovement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryTransferTicket"
ADD CONSTRAINT "InventoryTransferTicket_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryTransferTicket"
ADD CONSTRAINT "InventoryTransferTicket_approvedByUserId_fkey"
FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductPackagingProfile"
ADD CONSTRAINT "ProductPackagingProfile_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLog"
ADD CONSTRAINT "AuditLog_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "ReferralProfitPolicy" ("generation", "percentage", "isActive", "createdAt", "updatedAt")
VALUES
  (1, 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (2, 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (3, 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (4, 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("generation") DO UPDATE
SET
  "percentage" = EXCLUDED."percentage",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "ReferralProfitPolicy"
SET
  "isActive" = false,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "generation" > 4;
