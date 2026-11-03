// taches/verifier-paiements.js
// Paiements en ligne restes « en attente » (parent qui a ferme la page avant
// le retour, coupure reseau…) : verification automatique aupres de NotchPay
// toutes les 10 minutes ; abandon apres 48 heures.
const db = require("../config/db");
const logger = require("../utils/logger");

const verifier = async () => {
  const { verifierPaiement } = require("../modules/scolarite/routes");
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
