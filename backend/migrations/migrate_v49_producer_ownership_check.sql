-- MED-02 (auditoría seguridad Fase 4, 2026-09-22): garantiza en BD que todo
-- productor tiene al menos un "dueño" — su propia cuenta de usuario, o el
-- técnico que lo capturó (Registro Alterno). Sin esto, un bug de código
-- podría crear un productor "huérfano" sin dueño y la BD lo aceptaría.
--
-- Verificado antes de aplicar (2026-09-22): 0 filas con ambos campos NULL
-- en producción — el ALTER se aplica directo, sin necesidad de resolver
-- casos previos.

ALTER TABLE producer
  ADD CONSTRAINT chk_producer_tiene_dueno
  CHECK (
    usuario_id IS NOT NULL OR usuario_capturista_id IS NOT NULL
  );
