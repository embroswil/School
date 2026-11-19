// utils/membres.js
// Un enseignant peut exercer dans plusieurs etablissements (table enseignant_ecoles) ; users.school_id est
// l'etablissement ouvert dans sa session. Cote etablissement, un enseignant « appartient » a l'etablissement
// s'il y est membre, quel que soit l'etablissement qu'il a ouvert.
const db = require("../config/db");

// Condition SQL : la ligne de users (prefixe "u." ou "") appartient a l'etablissement du parametre $n
const membreSql = (prefixe, param) =>
  `(${prefixe}school_id = ${param} OR ${prefixe}id IN (SELECT user_id FROM enseignant_ecoles WHERE school_id = ${param}))`;

const estMembre = async (userId, schoolId) =>
  Boolean((await db.query("SELECT 1 FROM enseignant_ecoles WHERE user_id = $1 AND school_id = $2", [userId, schoolId])).rows[0]);

// Autres etablissements de l'enseignant (que celui donne)
const autresEcoles = async (userId, schoolId) =>
  (await db.query("SELECT school_id FROM enseignant_ecoles WHERE user_id = $1 AND school_id <> $2 ORDER BY created_at", [userId, schoolId])).rows.map((r) => r.school_id);

// L'etablissement se separe d'un enseignant qui exerce aussi ailleurs : son compte est garde, il n'est plus
// membre de cet etablissement (ni affecte a ses classes) ; s'il l'avait ouvert, il bascule sur un autre.
const retirerDeLEcole = async (userId, schoolId) => {
  const autres = await autresEcoles(userId, schoolId);
  await db.query("DELETE FROM enseignant_ecoles WHERE user_id = $1 AND school_id = $2", [userId, schoolId]);
  await db.query(
    `UPDATE class_subjects SET teacher_id = NULL
     WHERE teacher_id = $1 AND class_id IN (SELECT c.id FROM classes c JOIN academic_years ay ON ay.id = c.academic_year_id WHERE ay.school_id = $2)`,
    [userId, schoolId]
  );
  await db.query("UPDATE users SET school_id = $3, updated_at = NOW() WHERE id = $1 AND school_id = $2", [userId, schoolId, autres[0] || null]);
};

module.exports = { membreSql, estMembre, autresEcoles, retirerDeLEcole };
