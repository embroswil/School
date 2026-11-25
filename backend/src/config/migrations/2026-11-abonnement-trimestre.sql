-- Abonnement payable par trimestre (100 $ convertis, 57 000 FCFA) ou pour l'annee (155 000 FCFA),
-- avec un trimestre d'essai gratuit pour les nouveaux etablissements (schools.essai_fin).
ALTER TABLE schools ADD COLUMN IF NOT EXISTS essai_fin DATE;

INSERT INTO plateforme_reglages (cle, valeur) VALUES ('prix_defaut', '155000'), ('prix_trimestre', '57000')
ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur;
DELETE FROM plateforme_reglages WHERE cle = 'echeance';

-- annee en cours : nouveau prix annuel pour les etablissements sans tarif particulier ni paiement ;
-- les rappels repartent a zero (une serie de rappels par echeance de trimestre)
UPDATE abonnements a SET montant = 155000, rappels = '[]'::jsonb
WHERE a.montant = 150000
  AND NOT EXISTS (SELECT 1 FROM paiements_abonnement p WHERE p.abonnement_id = a.id)
  AND (SELECT tarif_annuel FROM schools s WHERE s.id = a.school_id) IS NULL;
