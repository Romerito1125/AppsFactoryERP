-- Permite vender productos por peso, volumen u otras fracciones.
ALTER TABLE "ProductWarehouse"
  ALTER COLUMN "quantity" TYPE DECIMAL(12, 3)
  USING "quantity"::numeric;

ALTER TABLE "InventoryMovement"
  ALTER COLUMN "quantity" TYPE DECIMAL(12, 3)
  USING "quantity"::numeric;

ALTER TABLE "InvoiceItem"
  ALTER COLUMN "quantity" TYPE DECIMAL(12, 3)
  USING "quantity"::numeric;

ALTER TABLE "QuoteItem"
  ALTER COLUMN "quantity" TYPE DECIMAL(12, 3)
  USING "quantity"::numeric;
