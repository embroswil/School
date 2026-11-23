-- Paiement direct (ordre de paiement) : le parent envoie, en plus des frais de scolarite, les frais de retrait
-- de l'operateur (1 %, fixe, non modifiable) et les frais de service Sùkûl (200 FCFA, reverses a l'etablissement).
ALTER TABLE ordres_paiement ADD COLUMN IF NOT EXISTS frais_retrait integer NOT NULL DEFAULT 0;
ALTER TABLE ordres_paiement ADD COLUMN IF NOT EXISTS frais_service integer NOT NULL DEFAULT 0;
