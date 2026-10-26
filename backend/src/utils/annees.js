// utils/annees.js
// Annees scolaires automatiques (calendrier camerounais) : chaque etablissement
// a toujours son annee en cours, creee sans intervention, a partir de 2026/2027.
// Rentree debut septembre, fin fin juin ; 3 trimestres.
const db = require("../config/db");

const PREMIERE_ANNEE = 2026;

/** Annee de debut de l'annee scolaire en cours (ex. 2026 pour 2026/2027). */
const anneeDebutCourante = (date = new Date()) => {
  const y = date.getFullYear();
  const debut = date.getMonth() >= 7 ? y : y - 1; // a partir d'aout : nouvelle annee
  return Math.max(PREMIERE_ANNEE, debut);
};

const trimestres = (y) => [
  [1, "1er trimestre", `${y}-09-01`, `${y}-12-20`],
  [2, "2e trimestre", `${y + 1}-01-05`, `${y + 1}-03-31`],
  [3, "3e trimestre", `${y + 1}-04-01`, `${y + 1}-06-30`],
];

/** Cree au besoin l'annee scolaire en cours de l'etablissement et la rend courante. */
const assurerAnneeScolaire = async (schoolId) => {
  if (!schoolId) return null;
  const y = anneeDebutCourante();
  const nom = `${y}/${y + 1}`;
  let { rows } = await db.query("SELECT id, name, is_current FROM academic_years WHERE school_id = $1 AND name = $2", [schoolId, nom]);
  let annee = rows[0];
  if (!annee) {
    ({ rows } = await db.query(
      `INSERT INTO academic_years (name, start_date, end_date, is_active, is_current, school_id)
       VALUES ($1, $2, $3, true, false, $4) RETURNING id, name, is_current`,
      [nom, `${y}-09-01`, `${y + 1}-06-30`, schoolId]
    ));
    annee = rows[0];
    for (const [num, nomT, debut, fin] of trimestres(y)) {
      await db.query(
        `INSERT INTO terms (academic_year_id, name, start_date, end_date, term_number, is_active)
         VALUES ($1, $2, $3, $4, $5, true) ON CONFLICT (academic_year_id, term_number) DO NOTHING`,
        [annee.id, nomT, debut, fin, num]
      );
    }
  }
  if (!annee.is_current) {
    await db.query("UPDATE academic_years SET is_current = false WHERE school_id = $1 AND id <> $2", [schoolId, annee.id]);
    await db.query("UPDATE academic_years SET is_current = true, is_active = true WHERE id = $1", [annee.id]);
  }
  return { id: annee.id, name: nom };
};

module.exports = { assurerAnneeScolaire, anneeDebutCourante };
