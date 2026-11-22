// utils/tentatives.js
// Limite les essais d'identification (date de naissance d'un eleve) : au-dela de quelques erreurs par jour,
// la verification automatique est refusee. Empeche de deviner une date de naissance en essayant toutes les dates.
const db = require("../config/db");

const MAX_PAR_JOUR = 5;

// Nombre d'erreurs deja faites ces dernieres 24 h pour cette cle
const erreurs = async (cle) =>
  (await db.query("SELECT COUNT(*)::int AS n FROM tentatives_identite WHERE cle = $1 AND created_at > NOW() - INTERVAL '24 hours'", [cle])).rows[0].n;

const bloque = async (cle, max = MAX_PAR_JOUR) => (await erreurs(cle)) >= max;

const noterErreur = async (cle) => {
  await db.query("INSERT INTO tentatives_identite (cle) VALUES ($1)", [cle]);
  // menage occasionnel des anciens essais
  if (Math.random() < 0.02) db.query("DELETE FROM tentatives_identite WHERE created_at < NOW() - INTERVAL '7 days'").catch(() => {});
};

module.exports = { bloque, noterErreur, MAX_PAR_JOUR };
