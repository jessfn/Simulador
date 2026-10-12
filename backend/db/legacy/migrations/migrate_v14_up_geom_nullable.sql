-- v14: Allow Tipo B producer registrations without polygon geometry
-- The geom column must be nullable for producers who only provide a point location
ALTER TABLE up ALTER COLUMN geom DROP NOT NULL;
