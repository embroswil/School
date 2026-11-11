// utils/quota-ia.js
// Plafond mensuel de « lectures automatiques » (IA) par etablissement.
// - limite par etablissement : colonne schools.quota_ia (vide = limite par defaut ; 0 = lecture desactivee) ;
// - limite par defaut : reglage de plateforme « quota_ia_defaut » (100 par defaut) ;
// - une lecture = un document, une photo ou un PDF envoye a l'IA (une liste de 5 photos compte 5).
// Les imports Excel / CSV et la saisie a la main ne comptent pas.
const db = require("../config/db");
const ApiError = require("./ApiError");
const { lireDocument } = require("./ia");

const DEFAUT = 100;
const defaut = async () => {
  const { rows } = await db.query("SELECT valeur FROM plateforme_reglages WHERE cle = 'quota_ia_defaut'");
  const v = Number(rows[0]?.valeur);
  return Number.isFinite(v) && v >= 0 ? v : DEFAUT;
};
const debutMois = "date_trunc('month', NOW() AT TIME ZONE 'Africa/Douala') AT TIME ZONE 'Africa/Douala'";

const etat = async (ecole) => {
  const [s, d, u] = await Promise.all([
    db.query("SELECT quota_ia FROM schools WHERE id = $1", [ecole]),
    defaut(),
    db.query(`SELECT COALESCE(SUM(poids), 0)::int AS n FROM ia_usage WHERE school_id = $1 AND created_at >= ${debutMois}`, [ecole]),
  ]);
  const propre = s.rows[0]?.quota_ia;
  const limite = propre === null || propre === undefined ? d : propre;
  const utilise = u.rows[0].n;
  return { limite, utilise, restant: Math.max(0, limite - utilise), parDefaut: propre === null || propre === undefined };
};

// Reserve des lectures ; refuse si le plafond du mois serait depasse
const reserver = async (ecole, userId, type, poids) => {
  const e = await etat(ecole);
  if (e.limite === 0) throw new ApiError(403, "La lecture automatique des documents n’est pas activée pour votre établissement. Utilisez l’import Excel ou CSV, ou contactez School.");
  if (e.utilise + poids > e.limite) {
    throw new ApiError(
      429,
      `Plafond de lectures automatiques atteint pour ce mois (${e.utilise} sur ${e.limite}). Utilisez l’import Excel ou CSV, ou la saisie à la main, ou contactez School pour augmenter le plafond.`
    );
  }
  const { rows } = await db.query("INSERT INTO ia_usage (school_id, user_id, type, poids) VALUES ($1, $2, $3, $4) RETURNING id", [ecole, userId || null, type, poids]);
  return rows[0].id;
};

/**
 * Lit un document avec l'IA en comptant la lecture sur le plafond de l'etablissement de l'utilisateur.
 * Si la lecture echoue, elle n'est pas comptee.
 */
const lireAvecQuota = async (req, type, args) => {
  const ecole = req.user?.schoolId;
  if (!ecole) return lireDocument(args); // administrateur de la plateforme : pas de plafond
  const poids = Math.max(1, (args.images?.length || 0) + (args.pdfs?.length || 0));
  const id = await reserver(ecole, req.user.id, type, poids);
  try {
    return await lireDocument(args);
  } catch (e) {
    await db.query("DELETE FROM ia_usage WHERE id = $1", [id]).catch(() => {});
    throw e;
  }
};

module.exports = { etat, defaut, lireAvecQuota, DEFAUT };
