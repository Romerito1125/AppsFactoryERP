ALTER TABLE "Client"
ADD COLUMN "hasCredit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "maxCredit" DECIMAL(14, 2) NOT NULL DEFAULT 0;

-- Keep current receivables available in Cobrar and preserve their existing balance.
UPDATE "Client" AS client
SET "hasCredit" = true,
    "maxCredit" = COALESCE(
      (
        SELECT SUM(credit."balance")
        FROM "InvoiceCredit" AS credit
        WHERE credit."clientId" = client."id"
          AND credit."balance" > 0
      ),
      0
    )
WHERE EXISTS (
  SELECT 1
  FROM "InvoiceCredit" AS credit
  WHERE credit."clientId" = client."id"
    AND credit."balance" > 0
);
