-- Lava e seca: preferências e ciclos acompanhados pela Luna
CREATE TABLE "WasherPref" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "voiceAllowed" BOOLEAN NOT NULL DEFAULT false,
    "notifyDone" BOOLEAN NOT NULL DEFAULT true,
    "speak" BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE "WasherCycle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "washerId" TEXT NOT NULL,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "program" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX "WasherCycle_washerId_endedAt_idx" ON "WasherCycle"("washerId", "endedAt");
