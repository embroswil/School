// taches/rappel-cours.js
// Au debut de chaque cours de l'emploi du temps, l'enseignant recoit une notification (et un « push »
// sur son telephone) : « Cours de 07:30 · 6e A — confirmez que vous etes en cours ». Un seul geste
// suffit, sans faire l'appel. Pas de rappel si l'enseignant a signale son absence ce jour-la.
const db = require("../config/db");
const logger = require("../utils/logger");

let enCours = false;
const rappeler = async () => {
  if (enCours) return;
  enCours = true;
  try {
    // Cours qui commencent dans les 5 prochaines minutes (heure du Cameroun) ; chaque cours une seule fois
    const { rows } = await db.query(
      `WITH m AS (SELECT (NOW() AT TIME ZONE 'Africa/Douala') AS t),
            cours AS (
              SELECT cr.school_id, cr.class_id, cr.debut, c.name AS classe, s.name AS matiere, cs.teacher_id, (SELECT t FROM m)::date AS d
              FROM creneaux cr JOIN classes c ON c.id = cr.class_id
              JOIN academic_years ay ON ay.id = c.academic_year_id AND ay.is_current
              JOIN class_subjects cs ON cs.class_id = cr.class_id AND cs.subject_id = cr.subject_id
              JOIN users u ON u.id = cs.teacher_id AND u.is_active
              LEFT JOIN subjects s ON s.id = cr.subject_id
              WHERE cr.jour = EXTRACT(ISODOW FROM (SELECT t FROM m))
                AND cr.debut BETWEEN (SELECT t FROM m)::time AND ((SELECT t FROM m) + INTERVAL '5 minutes')::time
                AND NOT EXISTS (SELECT 1 FROM absences_enseignants a WHERE a.teacher_id = cs.teacher_id AND a.date = (SELECT t FROM m)::date)),
            nouveaux AS (
              INSERT INTO cours_suivi (school_id, class_id, date, debut, teacher_id, rappel_le)
              SELECT school_id, class_id, d, debut, teacher_id, NOW() FROM cours
              ON CONFLICT (class_id, date, debut) DO UPDATE SET rappel_le = NOW()
                WHERE cours_suivi.rappel_le IS NULL AND cours_suivi.confirme_le IS NULL
              RETURNING class_id, debut)
       SELECT k.teacher_id, k.classe, k.matiere, to_char(k.debut, 'HH24:MI') AS debut
       FROM nouveaux n JOIN cours k ON k.class_id = n.class_id AND k.debut = n.debut`
    );
    for (const r of rows) {
      await db.query(
        `INSERT INTO notifications (user_id, title, message, type, data) VALUES ($1, $2, $3, 'attendance', '{"lien":"/mes-cours"}')`,
        [r.teacher_id, `Cours de ${r.debut} · ${r.classe}`, `${r.matiere || "Cours"} : touchez pour confirmer que vous êtes en cours.`]
      );
    }
  } catch (e) {
    logger.error(`Rappel des cours : ${e.message}`);
  } finally {
    enCours = false;
  }
};

const demarrer = () => setInterval(rappeler, 60 * 1000);

module.exports = { rappeler, demarrer };
