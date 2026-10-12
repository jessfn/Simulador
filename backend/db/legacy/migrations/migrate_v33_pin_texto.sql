-- v33: Guardar PIN en texto plano para consulta admin
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pin_texto VARCHAR(10);
