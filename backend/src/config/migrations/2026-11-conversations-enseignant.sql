-- Messagerie enseignant <-> parents : une conversation peut lier un parent (user_id) a un enseignant (teacher_id).
-- Ces conversations ne sont pas dans la boite de l'etablissement. Cote « ecole » = l'enseignant (from_school, unread_school).
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS teacher_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS student_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS conversations_teacher_idx ON conversations (teacher_id) WHERE teacher_id IS NOT NULL;
