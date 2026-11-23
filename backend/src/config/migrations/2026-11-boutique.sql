-- Boutique de l'etablissement : tenues, fournitures, listes par niveau (kits).
-- Le parent commande puis paie par transfert direct au numero de l'etablissement
-- (meme ordre de paiement que la scolarite) ; l'etablissement prepare et remet.

ALTER TABLE schools ADD COLUMN IF NOT EXISTS boutique_ouverte BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS boutique_articles (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  categorie VARCHAR(20) NOT NULL DEFAULT 'fournitures' CHECK (categorie IN ('tenue', 'fournitures', 'livres', 'autre')),
  nom VARCHAR(120) NOT NULL,
  description VARCHAR(300),
  prix INTEGER NOT NULL CHECK (prix >= 0),
  tailles TEXT[] NOT NULL DEFAULT '{}',
  niveaux TEXT[] NOT NULL DEFAULT '{}',
  actif BOOLEAN NOT NULL DEFAULT true,
  ordre INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE boutique_articles ADD COLUMN IF NOT EXISTS image TEXT;
CREATE INDEX IF NOT EXISTS boutique_articles_ecole ON boutique_articles (school_id);

CREATE TABLE IF NOT EXISTS boutique_kits (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  nom VARCHAR(120) NOT NULL,
  description VARCHAR(300),
  niveaux TEXT[] NOT NULL DEFAULT '{}',
  actif BOOLEAN NOT NULL DEFAULT true,
  ordre INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS boutique_kits_ecole ON boutique_kits (school_id);

CREATE TABLE IF NOT EXISTS boutique_kit_articles (
  kit_id INTEGER NOT NULL REFERENCES boutique_kits(id) ON DELETE CASCADE,
  article_id INTEGER NOT NULL REFERENCES boutique_articles(id) ON DELETE CASCADE,
  quantite INTEGER NOT NULL DEFAULT 1 CHECK (quantite BETWEEN 1 AND 99),
  PRIMARY KEY (kit_id, article_id)
);

CREATE TABLE IF NOT EXISTS boutique_commandes (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cree_par INTEGER REFERENCES users(id) ON DELETE SET NULL,
  statut VARCHAR(20) NOT NULL DEFAULT 'a_payer' CHECK (statut IN ('a_payer', 'payee', 'prete', 'remise', 'annulee')),
  montant INTEGER NOT NULL CHECK (montant > 0),
  payee_le TIMESTAMP,
  prete_le TIMESTAMP,
  remise_le TIMESTAMP,
  traite_par INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS boutique_commandes_ecole ON boutique_commandes (school_id, statut);
CREATE INDEX IF NOT EXISTS boutique_commandes_parent ON boutique_commandes (cree_par);

CREATE TABLE IF NOT EXISTS boutique_lignes (
  id SERIAL PRIMARY KEY,
  commande_id INTEGER NOT NULL REFERENCES boutique_commandes(id) ON DELETE CASCADE,
  article_id INTEGER REFERENCES boutique_articles(id) ON DELETE SET NULL,
  nom VARCHAR(120) NOT NULL,
  taille VARCHAR(30),
  quantite INTEGER NOT NULL CHECK (quantite BETWEEN 1 AND 99),
  prix INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS boutique_lignes_commande ON boutique_lignes (commande_id);

-- Un ordre de paiement porte soit un frais de scolarite, soit une commande de la boutique
ALTER TABLE ordres_paiement ALTER COLUMN frais_id DROP NOT NULL;
ALTER TABLE ordres_paiement ADD COLUMN IF NOT EXISTS commande_id INTEGER REFERENCES boutique_commandes(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS ordres_paiement_commande ON ordres_paiement (commande_id);

ALTER TABLE boutique_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE boutique_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE boutique_kit_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE boutique_commandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE boutique_lignes ENABLE ROW LEVEL SECURITY;
