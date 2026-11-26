-- Classeurs des conseils : modifications de l'etablissement par-dessus les tableaux calcules
CREATE TABLE IF NOT EXISTS classeurs (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  cle VARCHAR(120) NOT NULL,
  modifs JSONB NOT NULL DEFAULT '{}'::jsonb,
  modifie_par INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, cle)
);
ALTER TABLE classeurs ENABLE ROW LEVEL SECURITY;
