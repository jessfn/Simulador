-- v44: cuando un técnico ECA registra un productor nuevo (POST
-- /api/tecnico/registro-alterno), el frontend ya capturaba sexo, fecha de
-- nacimiento y la fuente de validación (SADER/RENAPO) que devuelve
-- /tecnico/consultar-curp, pero el backend los descartaba: `producer` no
-- tenía columnas para fecha de nacimiento ni fuente, y `sexo` sí existía
-- pero nunca se escribía en el INSERT. Se agregan las columnas que faltan
-- para poder persistir esos datos correctamente.

ALTER TABLE producer ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE;
ALTER TABLE producer ADD COLUMN IF NOT EXISTS fuente_registro VARCHAR(30);
