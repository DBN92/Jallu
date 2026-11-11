-- Caixa de areia automática: gatos, visitas e preferências
CREATE TABLE "LitterCat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slot" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "weightKg" REAL,
    "weightSet" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "LitterCat_slot_key" ON "LitterCat"("slot");

CREATE TABLE "LitterVisit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "boxId" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weightKg" REAL,
    "durationS" INTEGER,
    "catId" TEXT,
    CONSTRAINT "LitterVisit_catId_fkey" FOREIGN KEY ("catId") REFERENCES "LitterCat" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "LitterVisit_boxId_at_idx" ON "LitterVisit"("boxId", "at");

CREATE TABLE "LitterBoxPref" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "voiceAllowed" BOOLEAN NOT NULL DEFAULT false
);
