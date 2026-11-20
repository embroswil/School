-- Relances automatiques des frais de scolarite : 3 jours avant chaque echeance, puis 1, 8 et 15 jours apres,
-- aux parents des eleves qui n'ont pas tout paye. Chaque etape n'est envoyee qu'une fois par eleve et par frais.
ALTER TABLE schools ADD COLUMN IF NOT EXISTS relances_auto BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS relances_frais (
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  frais_id INTEGER NOT NULL REFERENCES frais_scolaires(id) ON DELETE CASCADE,
  etape SMALLINT NOT NULL, -- 0 : avant l'echeance ; 1, 2, 3 : apres
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, frais_id, etape)
);
CREATE INDEX IF NOT EXISTS relances_frais_ecole ON relances_frais (school_id, created_at);
ALTER TABLE relances_frais ENABLE ROW LEVEL SECURITY;
