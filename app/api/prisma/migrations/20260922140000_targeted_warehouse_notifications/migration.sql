ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BODEGA_TAREA';

ALTER TABLE "Notification"
ADD COLUMN "recipientUserId" INTEGER;

CREATE INDEX "Notification_recipientUserId_idx"
ON "Notification"("recipientUserId");

ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_recipientUserId_fkey"
FOREIGN KEY ("recipientUserId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
