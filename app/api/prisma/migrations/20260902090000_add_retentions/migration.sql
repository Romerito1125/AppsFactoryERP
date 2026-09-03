CREATE TABLE "Retention" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "subtracting" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "minimumBase" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "operationCode" TEXT,
    "operationDescription" TEXT,
    "applySales" BOOLEAN NOT NULL DEFAULT false,
    "applyPurchases" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Retention_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RetentionRange" (
    "id" SERIAL NOT NULL,
    "retentionId" INTEGER NOT NULL,
    "minimum" DECIMAL(12,2) NOT NULL,
    "maximum" DECIMAL(12,2) NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RetentionRange_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Retention_code_key" ON "Retention"("code");
CREATE INDEX "Retention_isActive_idx" ON "Retention"("isActive");
CREATE INDEX "RetentionRange_retentionId_sortOrder_idx" ON "RetentionRange"("retentionId", "sortOrder");

ALTER TABLE "RetentionRange"
ADD CONSTRAINT "RetentionRange_retentionId_fkey"
FOREIGN KEY ("retentionId") REFERENCES "Retention"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Retention" ("code", "description", "minimumBase", "operationCode", "operationDescription", "applyPurchases")
VALUES
  ('C25', 'RETENCIÓN EN COMPRAS DEL 2,5%', 764000, 'RC25', 'RETENCIÓN COMPRAS 2,5% DECLARANTES', true),
  ('IVA', 'RETENCIÓN DE IVA', 1000000, 'RIVA', 'RETENCIÓN IVA COMPRAS', true),
  ('ISLR', 'RETENCIÓN EN LA FUENTE', 500000, 'RISLR', 'RETENCIÓN ISLR SERVICIOS', true);

INSERT INTO "RetentionRange" ("retentionId", "minimum", "maximum", "percentage", "sortOrder")
SELECT "id", 0, 764000, 0, 0 FROM "Retention" WHERE "code" = 'C25';
INSERT INTO "RetentionRange" ("retentionId", "minimum", "maximum", "percentage", "sortOrder")
SELECT "id", 764000.01, 999999999.99, 2.5, 1 FROM "Retention" WHERE "code" = 'C25';
INSERT INTO "RetentionRange" ("retentionId", "minimum", "maximum", "percentage", "sortOrder")
SELECT "id", 0, 1000000, 0, 0 FROM "Retention" WHERE "code" = 'IVA';
INSERT INTO "RetentionRange" ("retentionId", "minimum", "maximum", "percentage", "sortOrder")
SELECT "id", 1000000.01, 999999999.99, 15, 1 FROM "Retention" WHERE "code" = 'IVA';
INSERT INTO "RetentionRange" ("retentionId", "minimum", "maximum", "percentage", "sortOrder")
SELECT "id", 0, 500000, 0, 0 FROM "Retention" WHERE "code" = 'ISLR';
INSERT INTO "RetentionRange" ("retentionId", "minimum", "maximum", "percentage", "sortOrder")
SELECT "id", 500000.01, 999999999.99, 4, 1 FROM "Retention" WHERE "code" = 'ISLR';
