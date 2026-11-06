-- Vigias visuais (garagem: carro/portão/movimento), fotos de referência e eventos com foto
CREATE TABLE "VisualWatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "zone" TEXT,
    "labelA" TEXT NOT NULL,
    "labelB" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "state" TEXT,
    "stateSince" DATETIME,
    "confidence" REAL,
    "lightEntity" TEXT,
    "lightMinutes" INTEGER NOT NULL DEFAULT 5,
    "alertMinutes" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "VisualRef" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "watchId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "vector" TEXT NOT NULL,
    "thumb" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VisualRef_watchId_fkey" FOREIGN KEY ("watchId") REFERENCES "VisualWatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "VisualRef_watchId_idx" ON "VisualRef"("watchId");
CREATE TABLE "CameraEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cameraId" TEXT NOT NULL,
    "watchId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "photo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "CameraEvent_createdAt_idx" ON "CameraEvent"("createdAt");
