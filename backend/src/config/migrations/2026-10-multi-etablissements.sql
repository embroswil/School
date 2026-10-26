-- Multi-etablissements (deja applique sur Supabase). A executer sur une base neuve.
CREATE TABLE IF NOT EXISTS schools (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) CHECK (type IN ('maternelle','primaire','college','lycee')),
  city VARCHAR(100),
  code VARCHAR(50) UNIQUE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id) ON DELETE RESTRICT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('pending','active','rejected'));
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','principal','teacher','parent','student'));
ALTER TABLE academic_years ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS parent_requests (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_first_name VARCHAR(100) NOT NULL,
  child_last_name VARCHAR(100) NOT NULL,
  child_class VARCHAR(100),
  child_birth_date DATE,
  relationship VARCHAR(50) DEFAULT 'parent',
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  student_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decision_reason TEXT,
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_parent_requests_school_status ON parent_requests(school_id, status);

-- Inscription libre (enseignants valides par l'etablissement)
CREATE TABLE IF NOT EXISTS teacher_requests (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subjects TEXT,
  qualification VARCHAR(255),
  experience VARCHAR(255),
  message TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decision_reason TEXT,
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE student_records ADD COLUMN IF NOT EXISTS declared_class VARCHAR(100);

-- « Inscrire mon etablissement »
CREATE TABLE IF NOT EXISTS school_requests (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('maternelle','primaire','college','lycee')),
  city VARCHAR(100),
  address TEXT,
  student_count VARCHAR(50),
  contact_first_name VARCHAR(100) NOT NULL,
  contact_last_name VARCHAR(100) NOT NULL,
  contact_function VARCHAR(100),
  contact_email VARCHAR(255) NOT NULL,
  contact_phone VARCHAR(30),
  password_hash VARCHAR(255) NOT NULL,
  message TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL,
  decision_reason TEXT,
  decided_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Photo, notifications et messagerie
ALTER TABLE schools ALTER COLUMN code DROP NOT NULL;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS photo TEXT;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('payment','grade','attendance','announcement','reminder','system','account','message'));
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject VARCHAR(200) NOT NULL,
  unread_school BOOLEAN NOT NULL DEFAULT true,
  unread_user BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS conversation_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  from_school BOOLEAN NOT NULL DEFAULT false,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Fil d'actualites
CREATE TABLE IF NOT EXISTS publications (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type VARCHAR(30) NOT NULL DEFAULT 'annonce'
    CHECK (type IN ('annonce','evenement','conseil_discipline','resultats','autre')),
  title VARCHAR(200) NOT NULL,
  body TEXT,
  event_date TIMESTAMP,
  event_place VARCHAR(200),
  students JSONB,
  image TEXT,
  audience VARCHAR(20) NOT NULL DEFAULT 'tous' CHECK (audience IN ('tous','parents','eleves','enseignants')),
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Scolarite
CREATE TABLE IF NOT EXISTS frais_scolaires (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id INTEGER REFERENCES academic_years(id) ON DELETE CASCADE,
  nom VARCHAR(120) NOT NULL,
  montant INTEGER NOT NULL CHECK (montant > 0),
  echeance DATE,
  classes TEXT[],
  obligatoire BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS paiements_scolaires (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  frais_id INTEGER NOT NULL REFERENCES frais_scolaires(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  montant INTEGER NOT NULL CHECK (montant > 0),
  mode VARCHAR(20) NOT NULL CHECK (mode IN ('mobile_money','especes','banque','autre')),
  statut VARCHAR(20) NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente','reussi','echoue')),
  reference VARCHAR(120) UNIQUE,
  telephone VARCHAR(30),
  paye_par INTEGER REFERENCES users(id) ON DELETE SET NULL,
  enregistre_par INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  confirme_le TIMESTAMP
);
