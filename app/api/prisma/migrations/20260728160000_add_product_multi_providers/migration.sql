CREATE TABLE "ProductProvider" (
    "productId" INTEGER NOT NULL,
    "providerId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductProvider_pkey" PRIMARY KEY ("productId","providerId")
);

CREATE INDEX "ProductProvider_productId_idx" ON "ProductProvider"("productId");
CREATE INDEX "ProductProvider_providerId_idx" ON "ProductProvider"("providerId");

ALTER TABLE "ProductProvider"
ADD CONSTRAINT "ProductProvider_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductProvider"
ADD CONSTRAINT "ProductProvider_providerId_fkey"
FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ProductProvider" ("productId", "providerId")
SELECT "id", "providerId"
FROM "Product"
ON CONFLICT ("productId", "providerId") DO NOTHING;
