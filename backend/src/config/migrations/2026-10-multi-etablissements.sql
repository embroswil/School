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
