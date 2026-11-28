-- Quem está em casa: ações ao chegar e ao sair o último
CREATE TABLE "PeopleConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'main',
    "arriveLight" TEXT,
    "leaveLightsOff" BOOLEAN NOT NULL DEFAULT true,
    "leaveNotify" BOOLEAN NOT NULL DEFAULT true
);
