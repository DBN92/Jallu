-- Câmeras lidas diretamente pela Luna (RTSP), para modelos que o Home Assistant não consegue processar
CREATE TABLE "DirectCamera" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "username" TEXT,
    "password" TEXT,
    "transport" TEXT NOT NULL DEFAULT 'udp',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
