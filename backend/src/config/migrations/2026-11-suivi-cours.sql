-- Suivi des cours : un cours n'est jamais compte « absent » parce que l'appel manque.
-- Chaque cours (classe, date, heure de debut) recoit des signaux : confirmation de l'enseignant
-- (« je suis en cours »), cahier de textes, appel, constat de la direction (ronde, liste fournie).
-- La cle (classe, date, heure) resiste au remplacement de l'emploi du temps.
CREATE TABLE IF NOT EXISTS cours_suivi (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  debut TIME NOT NULL,
  teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  confirme_le TIMESTAMP,
  contenu TEXT,
  contenu_le TIMESTAMP,
  constat VARCHAR(10) CHECK (constat IN ('present', 'absent')),
  constat_par INTEGER REFERENCES users(id) ON DELETE SET NULL,
  constat_le TIMESTAMP,
  constat_source VARCHAR(10),
  constat_note VARCHAR(300),
  rappel_le TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, date, debut)
);
CREATE INDEX IF NOT EXISTS idx_cours_suivi_ecole ON cours_suivi (school_id, date);
CREATE INDEX IF NOT EXISTS idx_cours_suivi_enseignant ON cours_suivi (teacher_id, date);

-- Absences des enseignants : origine (enseignant, administration, liste fournie par l'etablissement)
ALTER TABLE absences_enseignants ADD COLUMN IF NOT EXISTS source VARCHAR(10);

-- Acces uniquement par le serveur (comme les autres tables)
ALTER TABLE cours_suivi ENABLE ROW LEVEL SECURITY;
