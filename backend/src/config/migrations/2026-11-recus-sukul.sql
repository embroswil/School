-- Recus Sukul : numero unique propre a Sukul (SK-AAAA-0000123), distinct du numero du recu papier
-- ou du bordereau bancaire (recu_externe). Chaque paiement reussi recoit automatiquement son numero.
ALTER TABLE paiements_scolaires ADD COLUMN IF NOT EXISTS recu_externe VARCHAR(80);
CREATE UNIQUE INDEX IF NOT EXISTS paiements_recu_externe ON paiements_scolaires (school_id, recu_externe) WHERE recu_externe IS NOT NULL;

-- recus importes : le numero du fichier devient le numero du recu papier
UPDATE paiements_scolaires SET recu_externe = numero_recu WHERE numero_recu IS NOT NULL AND numero_recu NOT LIKE 'SK-%' AND numero_recu NOT LIKE 'REC-%' AND recu_externe IS NULL;
UPDATE paiements_scolaires SET numero_recu = 'SK-' || to_char(COALESCE(confirme_le, created_at), 'YYYY') || '-' || lpad(id::text, 7, '0')
WHERE statut = 'reussi' AND (numero_recu IS NULL OR numero_recu NOT LIKE 'SK-%');

CREATE OR REPLACE FUNCTION numero_recu_sukul() RETURNS trigger AS $$
BEGIN
  IF NEW.statut = 'reussi' AND (NEW.numero_recu IS NULL OR NEW.numero_recu NOT LIKE 'SK-%') THEN
    NEW.numero_recu := 'SK-' || to_char(COALESCE(NEW.confirme_le, NEW.created_at, NOW()), 'YYYY') || '-' || lpad(NEW.id::text, 7, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS paiements_numero_recu ON paiements_scolaires;
CREATE TRIGGER paiements_numero_recu BEFORE INSERT OR UPDATE OF statut, numero_recu ON paiements_scolaires
FOR EACH ROW EXECUTE FUNCTION numero_recu_sukul();
