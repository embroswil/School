-- Rappel de presence aux enseignants : l'etablissement choisit combien de minutes apres le debut du cours
-- l'enseignant est notifie s'il n'a pas encore confirme (15 par defaut ; NULL = pas de rappel)
ALTER TABLE schools ADD COLUMN IF NOT EXISTS rappel_presence_minutes SMALLINT DEFAULT 15;
