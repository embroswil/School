// modules/etablissement/routes.js
// Espace de l'administrateur d'un etablissement : tableau de bord, eleves,
// enseignants. Tout est limite a SON etablissement.
const express = require("express");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate, authorize } = require("../../middlewares/auth.middleware");

router.use(authenticate, authorize("admin"));

// Etablissement concerne : celui de l'utilisateur (ou ?ecole= pour l'admin de la plateforme)
const ecoleDe = (req) => {
  const id = req.user.role === "admin" ? parseInt(req.query.ecole, 10) : req.user.schoolId;
  if (!id) throw new ApiError(400, "Établissement non précisé");
  return id;
};
const anneeCourante = async (ecole) =>
  (
    await db.query(
      "SELECT id, name FROM academic_years WHERE school_id = $1 ORDER BY is_current DESC, start_date DESC LIMIT 1",
      [ecole]
    )
  ).rows[0] || null;

router.get("/tableau", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const annee = await anneeCourante(ecole);
    const { rows } = await db.query(
      `SELECT
        (SELECT name FROM schools WHERE id = $1) AS nom,
        (SELECT COUNT(*)::int FROM users WHERE school_id = $1 AND role = 'student') AS eleves,
        (SELECT COUNT(*)::int FROM users WHERE school_id = $1 AND role = 'teacher' AND status = 'active') AS enseignants,
        (SELECT COUNT(*)::int FROM users WHERE school_id = $1 AND role = 'teacher' AND status = 'pending') AS enseignants_attente,
        (SELECT COUNT(*)::int FROM users WHERE school_id = $1 AND role = 'parent') AS parents,
        (SELECT COUNT(*)::int FROM classes c JOIN academic_years ay ON ay.id = c.academic_year_id WHERE ay.school_id = $1 AND ($2::int IS NULL OR ay.id = $2)) AS classes,
        (SELECT COUNT(*)::int FROM users u WHERE u.school_id = $1 AND u.role = 'student'
           AND NOT EXISTS (SELECT 1 FROM class_students cs WHERE cs.student_id = u.id AND cs.status = 'active' AND ($2::int IS NULL OR cs.academic_year_id = $2))) AS eleves_sans_classe`,
      [ecole, annee?.id || null]
    );
    res.json({ success: true, data: { ...rows[0], annee } });
  } catch (e) {
    next(e);
  }
});

// Eleves de l'etablissement, avec la classe declaree a l'inscription et la classe reelle
router.get("/eleves", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const annee = await anneeCourante(ecole);
    const q = String(req.query.q || "").trim();
    const { rows } = await db.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, sr.declared_class, sr.date_of_birth,
              c.id AS class_id, c.name AS class_name,
              (SELECT COUNT(*)::int FROM parent_student_links p WHERE p.student_id = u.id) AS parents
       FROM users u
       LEFT JOIN student_records sr ON sr.student_id = u.id
       LEFT JOIN class_students cs ON cs.student_id = u.id AND cs.status = 'active' AND cs.academic_year_id = $2
       LEFT JOIN classes c ON c.id = cs.class_id
       WHERE u.school_id = $1 AND u.role = 'student'
         AND ($3 = '' OR (u.first_name || ' ' || u.last_name) ILIKE '%' || $3 || '%')
       ORDER BY c.name NULLS FIRST, u.last_name, u.first_name
       LIMIT 300`,
      [ecole, annee?.id || null, q]
    );
    res.json({ success: true, data: rows, annee });
  } catch (e) {
    next(e);
  }
});

// Placer un eleve dans une classe (de l'annee courante de l'etablissement)
router.post("/eleves/:id/classe", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const eleveId = parseInt(req.params.id, 10);
    const classId = parseInt((req.body || {}).classId, 10);
    const eleve = await db.query("SELECT id FROM users WHERE id = $1 AND role = 'student' AND school_id = $2", [eleveId, ecole]);
    if (!eleve.rows[0]) throw new ApiError(404, "Élève introuvable");
    const classe = await db.query(
      `SELECT c.id, c.academic_year_id FROM classes c JOIN academic_years ay ON ay.id = c.academic_year_id
       WHERE c.id = $1 AND ay.school_id = $2`,
      [classId, ecole]
    );
    if (!classe.rows[0]) throw new ApiError(400, "Classe introuvable dans cet établissement");
    const anneeId = classe.rows[0].academic_year_id;
    // Une seule classe active par annee
    await db.query(
      "UPDATE class_students SET status = 'transferred' WHERE student_id = $1 AND academic_year_id = $2 AND status = 'active' AND class_id <> $3",
      [eleveId, anneeId, classId]
    );
    await db.query(
      `INSERT INTO class_students (class_id, student_id, academic_year_id, status)
       SELECT $1, $2, $3, 'active'
       WHERE NOT EXISTS (SELECT 1 FROM class_students WHERE class_id = $1 AND student_id = $2 AND academic_year_id = $3)`,
      [classId, eleveId, anneeId]
    );
    await db.query(
      "UPDATE class_students SET status = 'active' WHERE class_id = $1 AND student_id = $2 AND academic_year_id = $3",
      [classId, eleveId, anneeId]
    );
    res.json({ success: true, message: "Élève placé dans la classe" });
  } catch (e) {
    next(e);
  }
});

// Enseignants actifs de l'etablissement (avec les matieres declarees)
router.get("/enseignants", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const { rows } = await db.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone,
              (SELECT tr.subjects FROM teacher_requests tr WHERE tr.user_id = u.id ORDER BY tr.id DESC LIMIT 1) AS matieres
       FROM users u WHERE u.school_id = $1 AND u.role = 'teacher' AND u.status = 'active'
       ORDER BY u.last_name, u.first_name`,
      [ecole]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
