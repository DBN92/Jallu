-- Maquete 3D da casa: vínculo entre as luzes desenhadas e as entidades do Home Assistant
CREATE TABLE "HouseLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT
);
