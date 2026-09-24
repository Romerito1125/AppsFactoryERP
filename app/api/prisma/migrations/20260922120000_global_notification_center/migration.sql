CREATE TYPE "NotificationPriority" AS ENUM ('NORMAL', 'IMPORTANTE', 'URGENTE');

ALTER TABLE "Notification"
ADD COLUMN "actionLabel" TEXT,
ADD COLUMN "actionModule" TEXT,
ADD COLUMN "actionView" TEXT,
ADD COLUMN "actionEntityId" INTEGER,
ADD COLUMN "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL';

CREATE TABLE "NotificationRead" (
  "id" SERIAL NOT NULL,
  "notificationId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NotificationRead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationRead_notificationId_userId_key"
ON "NotificationRead"("notificationId", "userId");
CREATE INDEX "NotificationRead_userId_readAt_idx"
ON "NotificationRead"("userId", "readAt");

ALTER TABLE "NotificationRead"
ADD CONSTRAINT "NotificationRead_notificationId_fkey"
FOREIGN KEY ("notificationId") REFERENCES "Notification"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationRead"
ADD CONSTRAINT "NotificationRead_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
