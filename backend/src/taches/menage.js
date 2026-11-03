// taches/menage.js
// Menage automatique de la base, une fois par jour, pour qu'elle ne grossisse pas
// inutilement (et reste dans l'offre la moins chere le plus longtemps possible) :
// - notifications lues de plus de 30 jours, et toutes celles de plus de 120 jours ;
// - codes email expires de plus de 2 jours.
const db = require("../config/db");
const logger = require("../utils/logger");

const menage = async () => {
  const n = await db.query(
    `DELETE FROM notifications
     WHERE (is_read AND created_at < NOW() - INTERVAL '30 days') OR created_at < NOW() - INTERVAL '120 days'`
  );
  const c = await db.query("DELETE FROM codes_email WHERE expire_le < NOW() - INTERVAL '2 days'");
  if (n.rowCount || c.rowCount) logger.info(`Ménage : ${n.rowCount} notification(s), ${c.rowCount} code(s) supprimé(s)`);
};

const demarrer = () => {
  const lancer = () => menage().catch((e) => logger.error(`Ménage : ${e.message}`));
  setTimeout(lancer, 5 * 60 * 1000);
  setInterval(lancer, 24 * 60 * 60 * 1000);
};

module.exports = { menage, demarrer };
