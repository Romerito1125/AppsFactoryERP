-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('UND', 'KG', 'G', 'LB', 'L', 'ML', 'CAJA', 'PAQUETE');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "unit" "UnitType" NOT NULL DEFAULT 'UND';

-- AlterTable
ALTER TABLE "ProductPrice" ADD COLUMN     "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
ADD COLUMN     "unit" "UnitType" NOT NULL DEFAULT 'UND';

-- CreateTable
CREATE TABLE "ProductCost" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL,
    "unit" "UnitType" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductCost_productId_idx" ON "ProductCost"("productId");

-- CreateIndex
CREATE INDEX "ProductCost_isActive_idx" ON "ProductCost"("isActive");

-- CreateIndex
CREATE INDEX "ProductCost_startsAt_idx" ON "ProductCost"("startsAt");

-- AddForeignKey
ALTER TABLE "ProductCost" ADD CONSTRAINT "ProductCost_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
