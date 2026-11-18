-- Travaux en arriere-plan : un travail (ex. installation d'un dossier) est decoupe en elements traites
-- un par un par le serveur. L'application peut etre fermee ; le travail reprend apres un redemarrage.
CREATE TABLE IF NOT EXISTS travaux (
  id SERIAL PRIMARY KEY,
  school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  titre TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'preparation' CHECK (statut IN ('preparation', 'en_cours', 'termine', 'erreur', 'annule')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  termine_le TIMESTAMPTZ,
  vu BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS travaux_utilisateur ON travaux (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS travaux_actifs ON travaux (statut) WHERE statut = 'en_cours';

CREATE TABLE IF NOT EXISTS travaux_elements (
  id SERIAL PRIMARY KEY,
  travail_id INTEGER NOT NULL REFERENCES travaux(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  ordre INTEGER NOT NULL DEFAULT 0,
  libelle TEXT,
  donnees JSONB NOT NULL,
  statut TEXT NOT NULL DEFAULT 'a_faire' CHECK (statut IN ('a_faire', 'fait', 'erreur')),
  resultat JSONB,
  traite_le TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS travaux_elements_travail ON travaux_elements (travail_id, statut, ordre, id);

ALTER TABLE travaux ENABLE ROW LEVEL SECURITY;
ALTER TABLE travaux_elements ENABLE ROW LEVEL SECURITY;
