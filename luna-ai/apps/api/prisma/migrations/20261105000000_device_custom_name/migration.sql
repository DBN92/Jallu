-- Nome personalizado do dispositivo na Luna (o nome no Home Assistant não é alterado)
ALTER TABLE "Device" ADD COLUMN "customName" TEXT;
