// utils/fil.js
// Fil d'informations automatique : School y publie lui-meme les faits utiles aux
// familles (documents televerses, notes publiees, emplois du temps, decisions de fin
// d'annee). Les listes d'eleves, la discipline et les paiements n'y vont jamais.
const db = require("../config/db");
const logger = require("./logger");

/**
 * Publie une information automatique. « cle » evite les doublons (une seule
 * publication par cle : par exemple une par evaluation, une par classe et par jour).
 */
const publierAuto = async ({ schoolId, type = "autre", titre, corps = null, categorie = null, medias = [], audience = "tous", cle = null, auteur = null }) => {
  try {
    await db.query(
      `INSERT INTO publications (school_id, author_id, type, title, body, audience, medias, categorie, source, cle_auto)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'auto', $9)
       ON CONFLICT (cle_auto) WHERE cle_auto IS NOT NULL
       DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, created_at = NOW()`,
      [schoolId, auteur, type, String(titre).slice(0, 200), corps, audience, JSON.stringify(medias), categorie, cle]
    );
  } catch (e) {
    logger.error(`Fil automatique : ${e.message}`);
  }
};

// Categories de documents, reconnues automatiquement d'apres le nom du fichier
const CATEGORIES = [
  ["absences", "Récapitulatif des absences", "autre", /absence|absent/i],
  ["communique", "Communiqué", "annonce", /communiqu|note de service|note-de-service|avis|information/i],
  ["reunion", "Réunion", "evenement", /r[ée]union|assembl[ée]e|apee|parents/i],
  ["emploi", "Emploi du temps", "autre", /emploi|edt|horaire|planning/i],
  ["calendrier", "Calendrier", "evenement", /calendrier|vacances|rentr[ée]e|cong[ée]/i],
  ["examen", "Examens", "evenement", /examen|composition|s[ée]quence|bac|bepc|probatoire|devoir surveill/i],
  ["resultats", "Résultats", "resultats", /r[ée]sultat|tableau d.honneur|admis|classement|palmar/i],
  ["fournitures", "Fournitures", "autre", /fourniture|liste de livres|manuels?/i],
  ["cantine", "Cantine", "autre", /cantine|menu|repas/i],
  ["evenement", "Événement", "evenement", /f[êe]te|sortie|excursion|tournoi|journ[ée]e|c[ée]r[ée]monie|semaine/i],
  ["autre", "Document", "autre", /.*/],
];
const categorieDe = (cle) => CATEGORIES.find((c) => c[0] === cle) || CATEGORIES[CATEGORIES.length - 1];
const devinerCategorie = (nom) => (CATEGORIES.find((c) => c[3].test(String(nom || ""))) || CATEGORIES[CATEGORIES.length - 1])[0];

module.exports = { publierAuto, CATEGORIES, categorieDe, devinerCategorie };
