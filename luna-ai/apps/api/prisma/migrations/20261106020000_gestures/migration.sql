-- Comandos por gesto de mão e área de análise por câmera direta
ALTER TABLE "DirectCamera" ADD COLUMN "gestureZone" TEXT;
CREATE TABLE "GestureRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gesture" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
