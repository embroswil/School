-- Essais d'identification (date de naissance d'un eleve) : limites par jour pour empecher de deviner
-- la date de naissance d'un enfant en essayant toutes les dates.
CREATE TABLE IF NOT EXISTS tentatives_identite (
  id bigserial PRIMARY KEY,
  cle text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tentatives_identite_cle_idx ON tentatives_identite (cle, created_at);
-- Table interne (lue par le serveur seulement) : fermee aux acces directs, comme les autres tables
ALTER TABLE tentatives_identite ENABLE ROW LEVEL SECURITY;
