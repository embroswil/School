-- Publications reservees a une classe (documents et informations d'un enseignant, resume des notes) :
-- seuls les parents et les eleves de cette classe les voient.
ALTER TABLE publications ADD COLUMN IF NOT EXISTS class_id integer REFERENCES classes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS publications_class_id_idx ON publications (class_id) WHERE class_id IS NOT NULL;
