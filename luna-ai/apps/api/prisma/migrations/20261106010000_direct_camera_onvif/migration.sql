-- Porta ONVIF da câmera direta (girar/inclinar/zoom feitos pela própria Luna)
ALTER TABLE "DirectCamera" ADD COLUMN "onvifPort" INTEGER;
