-- Estandariza los precios de venta en cuatro niveles globales: Precio 0..Precio 3.
ALTER TABLE "ProductPrice" ADD COLUMN "priceLevel" INTEGER;

WITH numbered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "productId"
      ORDER BY "isDefault" DESC, "id" ASC
    ) - 1 AS fallback_level
  FROM "ProductPrice"
), assigned AS (
  SELECT
    price."id",
    CASE
      WHEN lower(price."name") ~ '^precio[[:space:]]*[0-3]$'
        THEN substring(lower(price."name") from '[0-3]')::integer
      ELSE numbered.fallback_level
    END AS level
  FROM "ProductPrice" price
  JOIN numbered ON numbered."id" = price."id"
)
UPDATE "ProductPrice" price
SET "priceLevel" = assigned.level
FROM assigned
WHERE price."id" = assigned."id";

-- Si los datos antiguos tenían nombres duplicados o más de cuatro precios,
-- se conserva el primero (priorizando el default) y se desactivan los demás.
WITH duplicates AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "productId", "priceLevel"
      ORDER BY "isDefault" DESC, "id" ASC
    ) AS duplicate_number
  FROM "ProductPrice"
  WHERE "priceLevel" BETWEEN 0 AND 3
)
UPDATE "ProductPrice" price
SET "isActive" = false,
    "isDefault" = false,
    "priceLevel" = NULL
FROM duplicates
WHERE price."id" = duplicates."id"
  AND duplicates.duplicate_number > 1;

UPDATE "ProductPrice"
SET "isActive" = false,
    "isDefault" = false,
    "priceLevel" = NULL
WHERE "priceLevel" NOT BETWEEN 0 AND 3;

UPDATE "ProductPrice"
SET "name" = 'Precio ' || "priceLevel"
WHERE "priceLevel" BETWEEN 0 AND 3;

ALTER TABLE "ProductPrice"
  ADD CONSTRAINT "ProductPrice_priceLevel_check"
  CHECK ("priceLevel" IS NULL OR "priceLevel" BETWEEN 0 AND 3);

CREATE INDEX "ProductPrice_productId_priceLevel_idx"
  ON "ProductPrice"("productId", "priceLevel");
