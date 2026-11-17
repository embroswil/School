-- Module Comptabilite : budget previsionnel (postes) et journal des operations (recettes et depenses).
-- Les paiements de scolarite (paiements_scolaires) sont comptes automatiquement comme recettes.
CREATE TABLE IF NOT EXISTS compta_postes (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id INTEGER REFERENCES academic_years(id) ON DELETE SET NULL,
  nom TEXT NOT NULL,
  sens TEXT NOT NULL CHECK (sens IN ('recette', 'depense')),
  categorie TEXT,
  prevu BIGINT NOT NULL DEFAULT 0 CHECK (prevu >= 0),
  scolarite BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS compta_postes_unique ON compta_postes (school_id, COALESCE(academic_year_id, 0), lower(nom));

CREATE TABLE IF NOT EXISTS compta_operations (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id INTEGER REFERENCES academic_years(id) ON DELETE SET NULL,
  date_op DATE NOT NULL,
  sens TEXT NOT NULL CHECK (sens IN ('recette', 'depense')),
  libelle TEXT NOT NULL,
  poste_id INTEGER REFERENCES compta_postes(id) ON DELETE SET NULL,
  categorie TEXT,
  montant BIGINT NOT NULL CHECK (montant > 0),
  tiers TEXT,
  mode TEXT,
  piece TEXT,
  etat TEXT NOT NULL DEFAULT 'paye' CHECK (etat IN ('paye', 'engage')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS compta_operations_ecole ON compta_operations (school_id, date_op DESC);
-- une piece (bon de commande, facture) n'est importee qu'une fois
CREATE UNIQUE INDEX IF NOT EXISTS compta_operations_piece ON compta_operations (school_id, piece) WHERE piece IS NOT NULL AND piece <> '';

ALTER TABLE compta_postes ENABLE ROW LEVEL SECURITY;
ALTER TABLE compta_operations ENABLE ROW LEVEL SECURITY;
