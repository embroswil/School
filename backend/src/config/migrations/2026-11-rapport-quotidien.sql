-- Accuses de lecture des informations publiees (parents et eleves)
CREATE TABLE IF NOT EXISTS publication_vues (
  publication_id INTEGER NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vu_le TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (publication_id, user_id)
);
ALTER TABLE publication_vues ENABLE ROW LEVEL SECURITY;

-- Rapport du jour aux parents (un par parent et par jour) ; chaque parent peut le couper
CREATE TABLE IF NOT EXISTS rapports_quotidiens (
  parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jour DATE NOT NULL,
  PRIMARY KEY (parent_id, jour)
);
ALTER TABLE rapports_quotidiens ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rapport_quotidien BOOLEAN NOT NULL DEFAULT TRUE;
