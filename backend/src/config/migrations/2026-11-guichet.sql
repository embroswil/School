-- Guichet de l'intendance : un encaissement peut regler plusieurs frais d'un eleve en une fois.
-- Les lignes d'un meme encaissement partagent le meme numero d'operation (un seul recu imprime).
-- verse_par : nom de la personne qui a remis l'argent (parent, tuteur, eleve).
ALTER TABLE paiements_scolaires ADD COLUMN IF NOT EXISTS operation VARCHAR(40);
ALTER TABLE paiements_scolaires ADD COLUMN IF NOT EXISTS verse_par VARCHAR(120);
CREATE INDEX IF NOT EXISTS idx_paiements_operation ON paiements_scolaires (school_id, operation) WHERE operation IS NOT NULL;
