-- Un enseignant peut exercer dans plusieurs etablissements avec un seul compte.
-- users.school_id = etablissement OUVERT (celui de la session en cours) ;
-- enseignant_ecoles = tous les etablissements ou il est accepte.

CREATE TABLE IF NOT EXISTS enseignant_ecoles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, school_id)
);
CREATE INDEX IF NOT EXISTS enseignant_ecoles_ecole ON enseignant_ecoles (school_id);
ALTER TABLE enseignant_ecoles ENABLE ROW LEVEL SECURITY;

-- Enseignants deja actifs : leur etablissement actuel
INSERT INTO enseignant_ecoles (user_id, school_id)
SELECT id, school_id FROM users WHERE role = 'teacher' AND status = 'active' AND school_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Tout enseignant actif rattache a un etablissement (creation par l'etablissement, validation, changement
-- d'etablissement ouvert…) y est automatiquement membre
CREATE OR REPLACE FUNCTION sukul_membre_enseignant() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.role = 'teacher' AND NEW.status = 'active' AND NEW.school_id IS NOT NULL THEN
    INSERT INTO enseignant_ecoles (user_id, school_id) VALUES (NEW.id, NEW.school_id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sukul_membre_enseignant ON users;
CREATE TRIGGER sukul_membre_enseignant AFTER INSERT OR UPDATE OF role, status, school_id ON users
FOR EACH ROW EXECUTE FUNCTION sukul_membre_enseignant();

-- Etablissements pas encore sur Sukul, declares par les enseignants. Quand l'etablissement s'inscrit,
-- l'enseignant lui est propose automatiquement (school_id renseigne).
CREATE TABLE IF NOT EXISTS etablissements_declares (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nom VARCHAR(255) NOT NULL,
  ville VARCHAR(120),
  type VARCHAR(20),
  school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS etablissements_declares_user ON etablissements_declares (user_id);
ALTER TABLE etablissements_declares ENABLE ROW LEVEL SECURITY;
