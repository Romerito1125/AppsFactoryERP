ALTER TABLE "PurchaseOrderItem"
DROP COLUMN "taxRate",
DROP COLUMN "taxAmount";

ALTER TABLE "PurchaseOrder"
DROP COLUMN "taxes";
