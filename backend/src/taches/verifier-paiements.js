// taches/verifier-paiements.js
// Paiements en ligne restes « en attente » (parent qui a ferme la page avant
// le retour, coupure reseau…) : verification automatique aupres de NotchPay
// toutes les 10 minutes ; abandon apres 48 heures.
const db = require("../config/db");
const logger = require("../utils/logger");

const verifier = async () => {
  const { verifierPaiement } = require("../modules/scolarite/routes");
  // Ordres P2P : expiration des ordres non payes, rappel a l'etablissement apres 2 h sans confirmation
  await db.query("UPDATE ordres_paiement SET statut = 'expire' WHERE statut = 'a_payer' AND expire_le < NOW()");
  const { notifierEtablissement } = require("../utils/notifier");
  const attente = await db.query(
    `UPDATE ordres_paiement SET rappel_envoye = true
     WHERE statut = 'paye' AND NOT rappel_envoye AND paye_le < NOW() - INTERVAL '2 hours'
     RETURNING id, school_id, code, montant`
  );
  for (const o of attente.rows) {
    await notifierEtablissement(o.school_id, {
      title: "Paiement en attente de votre confirmation",
      message: `${Number(o.montant).toLocaleString("fr-FR")} FCFA · code ${o.code} : vérifiez votre compte Mobile Money et confirmez la réception.`,
      type: "payment",
      priority: "high",
      data: { lien: `/ordres/${o.id}` },
    }).catch(() => {});
  }
  await db.query("UPDATE paiements_scolaires SET statut = 'echoue' WHERE statut = 'en_attente' AND created_at < NOW() - INTERVAL '48 hours'");
  const { rows } = await db.query(
    `SELECT * FROM paiements_scolaires WHERE statut = 'en_attente' AND created_at < NOW() - INTERVAL '3 minutes'
     ORDER BY created_at LIMIT 50`
  );
  for (const p of rows) {
    try {
      await verifierPaiement(p);
    } catch (e) {
      logger.error(`Vérification du paiement ${p.reference} : ${e.message}`);
    }
  }
};

const demarrer = () => {
  const lancer = () => verifier().catch((e) => logger.error(`Vérification des paiements : ${e.message}`));
  setTimeout(lancer, 2 * 60 * 1000);
  setInterval(lancer, 10 * 60 * 1000);
};

module.exports = { verifier, demarrer };
