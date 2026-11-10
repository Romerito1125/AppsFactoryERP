ALTER TABLE "Client" ADD COLUMN "retentionId" INTEGER;

CREATE INDEX "Client_retentionId_idx" ON "Client"("retentionId");

ALTER TABLE "Client"
ADD CONSTRAINT "Client_retentionId_fkey"
FOREIGN KEY ("retentionId") REFERENCES "Retention"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
