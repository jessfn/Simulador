-- Up Migration
-- T10: edicion unica de datos personales y solicitudes de cambio.

-- 1) Historial: que renglones GASTAN la edicion unica de un tecnico y cual solicitud los origino.
--    Decision: se guarda una marca (en vez de adivinarla desde usuario/rol) porque es explicita, se consulta con un indice y deja a TODOS los
--    renglones anteriores (maiz nunca dejo historial) con la edicion disponible, tal como se pidio.
ALTER TABLE producer_cambios
  ADD COLUMN IF NOT EXISTS consume_edicion BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS solicitud_id    BIGINT,
  ADD COLUMN IF NOT EXISTS aprobado_por    INTEGER REFERENCES usuarios(id);

CREATE INDEX IF NOT EXISTS idx_producer_cambios_edicion ON producer_cambios (producer_id, campo) WHERE consume_edicion;

-- 2) Solicitudes de cambio (una por campo).
CREATE TABLE IF NOT EXISTS solicitud_cambio (
  id                      BIGSERIAL PRIMARY KEY,
  producer_id             BIGINT       NOT NULL REFERENCES producer(producer_id) ON DELETE CASCADE,
  campo                   VARCHAR(30)  NOT NULL CHECK (campo IN ('nombres','apellido_paterno','apellido_materno','sexo','fecha_nacimiento','correo','telefono')),
  valor_actual            TEXT,
  valor_propuesto         TEXT         NOT NULL,
  motivo                  TEXT         NOT NULL CHECK (length(btrim(motivo)) >= 5),
  solicitante_id          INTEGER      NOT NULL REFERENCES usuarios(id),
  programa_solicitante    VARCHAR(30)  NOT NULL REFERENCES cat_programa(clave),
  asignado_tipo           VARCHAR(10)  NOT NULL CHECK (asignado_tipo IN ('tecnico','admin')),
  asignado_a              INTEGER      REFERENCES usuarios(id),
  motivo_asignacion       TEXT         NOT NULL,
  estado                  VARCHAR(12)  NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','rechazada','cancelada')),
  escalada                BOOLEAN      NOT NULL DEFAULT FALSE,
  escalada_at             TIMESTAMPTZ,
  asignado_original_id    INTEGER      REFERENCES usuarios(id),
  resuelto_por            INTEGER      REFERENCES usuarios(id),
  resuelto_at             TIMESTAMPTZ,
  motivo_rechazo          TEXT,
  visto_por_solicitante   BOOLEAN      NOT NULL DEFAULT TRUE,
  vence_at                TIMESTAMPTZ  NOT NULL,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT solicitud_tecnico_con_asignado CHECK (asignado_tipo <> 'tecnico' OR asignado_a IS NOT NULL),
  CONSTRAINT solicitud_rechazo_con_motivo CHECK (estado <> 'rechazada' OR length(btrim(COALESCE(motivo_rechazo, ''))) > 0),
  CONSTRAINT solicitud_resuelta_con_responsable CHECK (estado = 'pendiente' OR resuelto_por IS NOT NULL)
);

-- Una sola solicitud pendiente por productor y campo (el servidor da un mensaje claro; esto es la barrera ante condiciones de carrera).
CREATE UNIQUE INDEX IF NOT EXISTS uq_solicitud_pendiente ON solicitud_cambio (producer_id, campo) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_solicitud_asignado ON solicitud_cambio (asignado_a, estado);
CREATE INDEX IF NOT EXISTS idx_solicitud_bandeja ON solicitud_cambio (asignado_tipo, estado, created_at);
CREATE INDEX IF NOT EXISTS idx_solicitud_solicitante ON solicitud_cambio (solicitante_id, created_at DESC);

ALTER TABLE producer_cambios
  ADD CONSTRAINT producer_cambios_solicitud_fk FOREIGN KEY (solicitud_id) REFERENCES solicitud_cambio(id);

-- Verificacion: la migracion NO debe haber gastado la edicion de nadie.
DO $$
DECLARE gastadas bigint;
BEGIN
  SELECT COUNT(*) INTO gastadas FROM producer_cambios WHERE consume_edicion;
  IF gastadas > 0 THEN
    RAISE EXCEPTION 'La migracion 0007 dejo % renglon(es) con la edicion gastada; deben empezar todos en cero', gastadas;
  END IF;
END $$;

-- Down Migration
-- No se puede bajar si hay solicitudes: se perderia el historial de quien pidio y quien aprobo (como hacen 0003 y 0006).
DO $$
DECLARE hay bigint;
BEGIN
  IF to_regclass('solicitud_cambio') IS NOT NULL THEN
    SELECT COUNT(*) INTO hay FROM solicitud_cambio;
    IF hay > 0 THEN
      RAISE EXCEPTION 'No se puede revertir 0007: hay % solicitud(es) de cambio. Se perderia su historial; exportalo primero.', hay;
    END IF;
  END IF;
END $$;
ALTER TABLE producer_cambios DROP CONSTRAINT IF EXISTS producer_cambios_solicitud_fk;
DROP TABLE IF EXISTS solicitud_cambio;
DROP INDEX IF EXISTS idx_producer_cambios_edicion;
ALTER TABLE producer_cambios DROP COLUMN IF EXISTS aprobado_por, DROP COLUMN IF EXISTS solicitud_id, DROP COLUMN IF EXISTS consume_edicion;
