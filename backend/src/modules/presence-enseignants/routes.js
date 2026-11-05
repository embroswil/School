// modules/presence-enseignants/routes.js
// Presence des enseignants : chaque cours de l'emploi du temps sans appel est un cours
// probablement non assure ; l'enseignant peut signaler son absence a l'avance, et
// l'administration peut marquer un enseignant absent.
const express = require("express");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate } = require("../../middlewares/auth.middleware");
const { notifierEtablissement } = require("../../utils/notifier");

router.use(authenticate);
const entier = (v) => parseInt(v, 10);
const jourCameroun = () => new Date(Date.now() + 3600 * 1000).toISOString().slice(0, 10);
const dateOk = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || "") ? d : null);
const reserveAdmin = (req) => {
  if (req.user.role !== "principal") throw new ApiError(403, "Réservé à l’administration de l’établissement");
};

// GET /api/presence-enseignants?date= : cours du jour (appel fait ou non) et absences signalees
router.get("/", async (req, res, next) => {
  try {
    reserveAdmin(req);
    const ecole = req.user.schoolId;
    const date = dateOk(req.query.date) || jourCameroun();
    const cours = (
      await db.query(
        `SELECT cr.id, to_char(cr.debut, 'HH24:MI') AS debut, to_char(cr.fin, 'HH24:MI') AS fin, c.id AS class_id, c.name AS classe,
                s.name AS matiere, u.id AS teacher_id, u.first_name, u.last_name, u.phone,
                EXISTS (SELECT 1 FROM appels ap WHERE ap.class_id = cr.class_id AND ap.date = $2::date
                        AND (ap.period_number = to_char(cr.debut, 'HH24MI')::int OR ap.period_number IS NULL)) AS appel
         FROM creneaux cr JOIN classes c ON c.id = cr.class_id
         JOIN academic_years ay ON ay.id = c.academic_year_id AND ay.is_current
         LEFT JOIN subjects s ON s.id = cr.subject_id
         LEFT JOIN class_subjects cs ON cs.class_id = cr.class_id AND cs.subject_id = cr.subject_id
         LEFT JOIN users u ON u.id = cs.teacher_id
         WHERE cr.school_id = $1 AND cr.jour = EXTRACT(ISODOW FROM $2::date)
         ORDER BY cr.debut, c.name`,
        [ecole, date]
      )
    ).rows;
    const absences = (
      await db.query(
        `SELECT a.id, a.teacher_id, a.motif, u.first_name, u.last_name, (a.declare_par = a.teacher_id) AS par_lui
         FROM absences_enseignants a JOIN users u ON u.id = a.teacher_id WHERE a.school_id = $1 AND a.date = $2`,
        [ecole, date]
      )
    ).rows;
    // Cours sans appel sur les 30 derniers jours, par enseignant (cours deja passes)
    const bilan = (
      await db.query(
        `WITH jours AS (SELECT d::date AS d FROM generate_series($2::date - 29, $2::date, '1 day') d),
              prevus AS (
                SELECT j.d, cr.class_id, cr.debut, cs.teacher_id
                FROM jours j JOIN creneaux cr ON cr.jour = EXTRACT(ISODOW FROM j.d) AND cr.school_id = $1
                JOIN classes c ON c.id = cr.class_id JOIN academic_years ay ON ay.id = c.academic_year_id AND ay.is_current
                JOIN class_subjects cs ON cs.class_id = cr.class_id AND cs.subject_id = cr.subject_id
                WHERE cs.teacher_id IS NOT NULL AND (j.d < $3::date OR (j.d = $3::date AND cr.fin < (NOW() + INTERVAL '1 hour')::time)))
         SELECT p.teacher_id, u.first_name, u.last_name, COUNT(*)::int AS prevus,
                COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM appels ap WHERE ap.class_id = p.class_id AND ap.date = p.d
                  AND (ap.period_number = to_char(p.debut, 'HH24MI')::int OR ap.period_number IS NULL)))::int AS sans_appel,
                (SELECT COUNT(*)::int FROM absences_enseignants a WHERE a.teacher_id = p.teacher_id AND a.date BETWEEN $2::date - 29 AND $2::date) AS absences
         FROM prevus p JOIN users u ON u.id = p.teacher_id
         GROUP BY p.teacher_id, u.first_name, u.last_name ORDER BY sans_appel DESC, u.last_name`,
        [ecole, date, jourCameroun()]
      )
    ).rows;
    const maintenant = new Date(Date.now() + 3600 * 1000).toISOString().slice(11, 16);
    res.json({
      success: true,
      data: {
        date,
        cours: cours.map((c) => ({
          ...c,
          etat: c.appel ? "assure" : date < jourCameroun() || (date === jourCameroun() && c.fin <= maintenant) ? "sans_appel" : "a_venir",
          absent: absences.some((a) => a.teacher_id === c.teacher_id),
        })),
        absences,
        bilan,
      },
    });
  } catch (e) {
    next(e);
  }
});

// POST /api/presence-enseignants { date, motif, teacherId? } : l'enseignant signale son absence,
// ou l'administration marque un enseignant absent
router.post("/", async (req, res, next) => {
  try {
    if (!["principal", "teacher"].includes(req.user.role)) throw new ApiError(403, "Accès réservé");
    const date = dateOk(req.body?.date);
    if (!date) throw new ApiError(400, "Date invalide");
    const teacherId = req.user.role === "teacher" ? req.user.id : entier(req.body?.teacherId);
    const t = (await db.query("SELECT id, first_name, last_name FROM users WHERE id = $1 AND role = 'teacher' AND school_id = $2", [teacherId, req.user.schoolId])).rows[0];
    if (!t) throw new ApiError(404, "Enseignant introuvable");
    const motif = String(req.body?.motif || "").trim().slice(0, 300) || null;
    await db.query(
      `INSERT INTO absences_enseignants (school_id, teacher_id, date, motif, declare_par) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (teacher_id, date) DO UPDATE SET motif = COALESCE(EXCLUDED.motif, absences_enseignants.motif)`,
      [req.user.schoolId, teacherId, date, motif, req.user.id]
    );
    if (req.user.role === "teacher") {
      const jour = new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
      await notifierEtablissement(req.user.schoolId, {
        title: "Absence d’un enseignant",
        message: `${t.first_name} ${t.last_name} sera absent(e) le ${jour}${motif ? ` : ${motif}` : ""}.`,
        type: "attendance",
        data: { lien: "/presence-enseignants" },
      }).catch(() => {});
    }
    res.status(201).json({ success: true });
  } catch (e) {
    next(e);
  }
});

// DELETE /api/presence-enseignants/:id : retirer une absence signalee
router.delete("/:id", async (req, res, next) => {
  try {
    if (!["principal", "teacher"].includes(req.user.role)) throw new ApiError(403, "Accès réservé");
    const r = await db.query(
      "DELETE FROM absences_enseignants WHERE id = $1 AND school_id = $2 AND ($3::int IS NULL OR teacher_id = $3)",
      [entier(req.params.id), req.user.schoolId, req.user.role === "teacher" ? req.user.id : null]
    );
    if (!r.rowCount) throw new ApiError(404, "Absence introuvable");
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// GET /api/presence-enseignants/miennes : absences signalees par l'enseignant
router.get("/miennes", async (req, res, next) => {
  try {
    const { rows } = await db.query(
      "SELECT id, date, motif FROM absences_enseignants WHERE teacher_id = $1 AND date >= CURRENT_DATE - 30 ORDER BY date DESC",
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
