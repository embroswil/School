// modules/notes/routes.js
// Notes (systeme camerounais : 6 sequences, 2 par trimestre, notes sur 20,
// coefficients par matiere) et appel (presences) d'une classe.
// Acces : administrateur de l'etablissement (toutes les classes) ; enseignant
// (seulement les classes et matieres qui lui sont affectees).
const express = require("express");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate } = require("../../middlewares/auth.middleware");
const { notifierUtilisateur } = require("../../utils/notifier");

router.use(authenticate);

const entier = (v) => parseInt(v, 10);
const TRIMESTRE = (seq) => Math.ceil(seq / 2);

// La classe doit etre de l'etablissement de l'utilisateur ; un enseignant
// doit y etre affecte (pour la matiere donnee, si elle est precisee).
const verifierClasse = async (u, classId, subjectId = null) => {
  if (!["principal", "teacher", "admin"].includes(u.role)) throw new ApiError(403, "Accès réservé");
  const { rows } = await db.query(
    `SELECT c.id, c.name, c.academic_year_id, ay.school_id FROM classes c
     JOIN academic_years ay ON ay.id = c.academic_year_id WHERE c.id = $1`,
    [classId]
  );
  const c = rows[0];
  if (!c || (u.role !== "admin" && c.school_id !== u.schoolId)) throw new ApiError(404, "Classe introuvable");
  if (u.role === "teacher") {
    const a = await db.query(
      "SELECT 1 FROM class_subjects WHERE class_id = $1 AND teacher_id = $2 AND ($3::int IS NULL OR subject_id = $3) LIMIT 1",
      [classId, u.id, subjectId]
    );
    if (!a.rows[0]) throw new ApiError(403, "Vous n'êtes pas affecté à cette classe pour cette matière");
  }
  return c;
};

const elevesDe = async (classId) =>
  (
    await db.query(
      `SELECT u.id, u.first_name, u.last_name FROM class_students cs JOIN users u ON u.id = cs.student_id
       WHERE cs.class_id = $1 AND cs.status = 'active' ORDER BY u.last_name, u.first_name`,
      [classId]
    )
  ).rows;

// ---------------------------------------------------------------- matieres et evaluations

// GET /api/notes/classes/:id : matieres (coefficient, enseignant) et evaluations
router.get("/classes/:id", async (req, res, next) => {
  try {
    const c = await verifierClasse(req.user, entier(req.params.id));
    const matieres = await db.query(
      `SELECT s.id, s.name, COALESCE(cs.coefficient, 2) AS coefficient, cs.teacher_id,
              u.first_name AS prof_prenom, u.last_name AS prof_nom
       FROM subjects s
       LEFT JOIN class_subjects cs ON cs.subject_id = s.id AND cs.class_id = $1
       LEFT JOIN users u ON u.id = cs.teacher_id
       WHERE s.school_id = $2 AND s.is_active = true
         AND ($3::int IS NULL OR cs.teacher_id = $3)
       ORDER BY (cs.id IS NULL), s.name`,
      [c.id, c.school_id, req.user.role === "teacher" ? req.user.id : null]
    );
    const evals = await db.query(
      `SELECT e.id, e.subject_id, e.sequence, e.titre, e.date_eval, e.bareme, e.publiee, s.name AS matiere,
              (SELECT COUNT(*)::int FROM notes_eleves n WHERE n.evaluation_id = e.id AND (n.note IS NOT NULL OR n.absent)) AS saisies,
              (SELECT ROUND(AVG(n.note * 20 / e.bareme), 2) FROM notes_eleves n WHERE n.evaluation_id = e.id AND n.note IS NOT NULL) AS moyenne
       FROM evaluations e JOIN subjects s ON s.id = e.subject_id
       WHERE e.class_id = $1 AND ($2::int IS NULL OR e.subject_id IN
         (SELECT subject_id FROM class_subjects WHERE class_id = $1 AND teacher_id = $2))
       ORDER BY e.sequence DESC, e.created_at DESC`,
      [c.id, req.user.role === "teacher" ? req.user.id : null]
    );
    const nb = await db.query("SELECT COUNT(*)::int AS n FROM class_students WHERE class_id = $1 AND status = 'active'", [c.id]);
    res.json({ success: true, data: { classe: { id: c.id, name: c.name, eleves: nb.rows[0].n }, matieres: matieres.rows, evaluations: evals.rows } });
  } catch (e) {
    next(e);
  }
});

// PUT /api/notes/classes/:id/coefficients { coefficients: { subjectId: coef } } (etablissement)
router.put("/classes/:id/coefficients", async (req, res, next) => {
  try {
    if (req.user.role === "teacher") throw new ApiError(403, "Réservé à l'établissement");
    const c = await verifierClasse(req.user, entier(req.params.id));
    const coefs = req.body?.coefficients || {};
    for (const [sid, coef] of Object.entries(coefs)) {
      const v = Number(coef);
      if (!(v > 0 && v <= 10)) continue;
      await db.query(
        `INSERT INTO class_subjects (class_id, subject_id, academic_year_id, coefficient, is_active)
         SELECT $1, s.id, $3, $4, true FROM subjects s WHERE s.id = $2 AND s.school_id = $5
         ON CONFLICT (class_id, subject_id, academic_year_id) DO UPDATE SET coefficient = EXCLUDED.coefficient`,
        [c.id, entier(sid), c.academic_year_id, v, c.school_id]
      );
    }
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// POST /api/notes/evaluations { classId, subjectId, sequence, titre, date, bareme }
router.post("/evaluations", async (req, res, next) => {
  try {
    const b = req.body || {};
    const classId = entier(b.classId);
    const subjectId = entier(b.subjectId);
    const c = await verifierClasse(req.user, classId, subjectId);
    const sequence = entier(b.sequence);
    if (!(sequence >= 1 && sequence <= 6)) throw new ApiError(400, "Séquence de 1 à 6");
    const s = await db.query("SELECT 1 FROM subjects WHERE id = $1 AND school_id = $2", [subjectId, c.school_id]);
    if (!s.rows[0]) throw new ApiError(400, "Choisissez la matière");
    const bareme = Number(b.bareme) > 0 ? Number(b.bareme) : 20;
    const { rows } = await db.query(
      `INSERT INTO evaluations (school_id, academic_year_id, class_id, subject_id, sequence, titre, date_eval, bareme, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [c.school_id, c.academic_year_id, classId, subjectId, sequence, String(b.titre || "Devoir").trim().slice(0, 150) || "Devoir", b.date || null, bareme, req.user.id]
    );
    res.status(201).json({ success: true, data: { id: rows[0].id } });
  } catch (e) {
    next(e);
  }
});

const chargerEvaluation = async (u, id) => {
  const { rows } = await db.query(
    `SELECT e.*, s.name AS matiere, c.name AS classe FROM evaluations e
     JOIN subjects s ON s.id = e.subject_id JOIN classes c ON c.id = e.class_id WHERE e.id = $1`,
    [id]
  );
  const e = rows[0];
  if (!e) throw new ApiError(404, "Évaluation introuvable");
  await verifierClasse(u, e.class_id, e.subject_id);
  return e;
};

// GET /api/notes/evaluations/:id : eleves de la classe et leurs notes
router.get("/evaluations/:id", async (req, res, next) => {
  try {
    const e = await chargerEvaluation(req.user, entier(req.params.id));
    const { rows } = await db.query(
      `SELECT u.id, u.first_name, u.last_name, n.note, n.absent, n.appreciation
       FROM class_students cs JOIN users u ON u.id = cs.student_id
       LEFT JOIN notes_eleves n ON n.evaluation_id = $1 AND n.student_id = u.id
       WHERE cs.class_id = $2 AND cs.status = 'active'
       ORDER BY u.last_name, u.first_name`,
      [e.id, e.class_id]
    );
    res.json({ success: true, data: { evaluation: e, eleves: rows } });
  } catch (e) {
    next(e);
  }
});

// PUT /api/notes/evaluations/:id { notes: [{ studentId, note, absent, appreciation }], publiee }
router.put("/evaluations/:id", async (req, res, next) => {
  try {
    const e = await chargerEvaluation(req.user, entier(req.params.id));
    const notes = Array.isArray(req.body?.notes) ? req.body.notes : [];
    const ids = [];
    const valeurs = [];
    const absents = [];
    const apprec = [];
    for (const n of notes) {
      const id = entier(n.studentId);
      if (!id) continue;
      const brut = n.note === "" || n.note === null || n.note === undefined ? null : Number(String(n.note).replace(",", "."));
      if (brut !== null && !(brut >= 0 && brut <= Number(e.bareme))) throw new ApiError(400, `Note entre 0 et ${Number(e.bareme)}`);
      ids.push(id);
      valeurs.push(brut);
      absents.push(Boolean(n.absent));
      apprec.push(n.appreciation ? String(n.appreciation).slice(0, 200) : null);
    }
    if (ids.length) {
      await db.query(
        `INSERT INTO notes_eleves (evaluation_id, student_id, note, absent, appreciation, saisie_par, updated_at)
         SELECT $1, x.id, x.note, x.absent, x.app, $6, NOW()
         FROM unnest($2::int[], $3::numeric[], $4::boolean[], $5::text[]) AS x(id, note, absent, app)
         WHERE x.id IN (SELECT student_id FROM class_students WHERE class_id = $7 AND status = 'active')
         ON CONFLICT (evaluation_id, student_id) DO UPDATE SET
           note = EXCLUDED.note, absent = EXCLUDED.absent, appreciation = EXCLUDED.appreciation,
           saisie_par = EXCLUDED.saisie_par, updated_at = NOW()`,
        [e.id, ids, valeurs, absents, apprec, req.user.id, e.class_id]
      );
    }
    // Publication : les parents et les eleves voient les notes
    if (req.body?.publiee === true && !e.publiee) {
      await db.query("UPDATE evaluations SET publiee = true WHERE id = $1", [e.id]);
      await db
        .query(
          `INSERT INTO notifications (user_id, title, message, type, data)
           SELECT DISTINCT dest, $2, $3, 'grade', '{"lien":"/notes"}'::jsonb FROM (
             SELECT cs.student_id AS dest FROM class_students cs JOIN users u ON u.id = cs.student_id
             WHERE cs.class_id = $1 AND cs.status = 'active' AND u.email NOT LIKE '%@inscrit.school'
             UNION
             SELECT l.parent_id FROM parent_student_links l JOIN class_students cs ON cs.student_id = l.student_id
             WHERE cs.class_id = $1 AND cs.status = 'active'
           ) d`,
          [e.class_id, `Nouvelle note : ${e.matiere}`, `${e.titre} · Séquence ${e.sequence} · ${e.classe}`]
        )
        .catch(() => {});
    } else if (req.body?.publiee === false) {
      await db.query("UPDATE evaluations SET publiee = false WHERE id = $1", [e.id]);
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete("/evaluations/:id", async (req, res, next) => {
  try {
    const e = await chargerEvaluation(req.user, entier(req.params.id));
    await db.query("DELETE FROM evaluations WHERE id = $1", [e.id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/notes/classes/:id/resultats?sequence=1 (ou ?trimestre=1)
// Moyenne par matiere (sur 20), moyenne generale ponderee par les coefficients, rang.
router.get("/classes/:id/resultats", async (req, res, next) => {
  try {
    if (req.user.role === "teacher") throw new ApiError(403, "Réservé à l'établissement");
    const c = await verifierClasse(req.user, entier(req.params.id));
    const seq = entier(req.query.sequence);
    const tri = entier(req.query.trimestre);
    const sequences = seq ? [seq] : tri ? [tri * 2 - 1, tri * 2] : [1, 2, 3, 4, 5, 6];
    const { rows } = await db.query(
      `WITH notes AS (
         SELECT n.student_id, e.subject_id, AVG(n.note * 20 / e.bareme) AS moy
         FROM notes_eleves n JOIN evaluations e ON e.id = n.evaluation_id
         WHERE e.class_id = $1 AND e.sequence = ANY($2) AND n.note IS NOT NULL
         GROUP BY n.student_id, e.subject_id
       )
       SELECT n.student_id, n.subject_id, ROUND(n.moy, 2) AS moyenne, COALESCE(cs.coefficient, 2) AS coef
       FROM notes n LEFT JOIN class_subjects cs ON cs.class_id = $1 AND cs.subject_id = n.subject_id`,
      [c.id, sequences]
    );
    const eleves = await elevesDe(c.id);
    const parEleve = new Map(eleves.map((e) => [e.id, { ...e, matieres: {}, total: 0, coefs: 0 }]));
    for (const r of rows) {
      const e = parEleve.get(r.student_id);
      if (!e) continue;
      e.matieres[r.subject_id] = Number(r.moyenne);
      e.total += Number(r.moyenne) * Number(r.coef);
      e.coefs += Number(r.coef);
    }
    const liste = [...parEleve.values()].map((e) => ({
      id: e.id,
      prenom: e.first_name,
      nom: e.last_name,
      moyenne: e.coefs ? Math.round((e.total / e.coefs) * 100) / 100 : null,
      matieres: e.matieres,
    }));
    const classes = liste.filter((e) => e.moyenne !== null).sort((a, b) => b.moyenne - a.moyenne);
    classes.forEach((e, i) => {
      e.rang = i > 0 && classes[i - 1].moyenne === e.moyenne ? classes[i - 1].rang : i + 1;
    });
    const notes = classes.map((e) => e.moyenne);
    res.json({
      success: true,
      data: {
        eleves: [...classes, ...liste.filter((e) => e.moyenne === null)],
        statistiques: {
          moyenneClasse: notes.length ? Math.round((notes.reduce((s, x) => s + x, 0) / notes.length) * 100) / 100 : null,
          plusHaute: notes.length ? Math.max(...notes) : null,
          plusBasse: notes.length ? Math.min(...notes) : null,
          reussite: notes.length ? Math.round((notes.filter((x) => x >= 10).length / notes.length) * 100) : null,
          classes: notes.length,
        },
        sequences,
        trimestre: seq ? TRIMESTRE(seq) : tri || null,
      },
    });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------- appel (presences)

// GET /api/notes/appel/:classId?date=AAAA-MM-JJ
router.get("/appel/:classId", async (req, res, next) => {
  try {
    const c = await verifierClasse(req.user, entier(req.params.classId));
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || "") ? req.query.date : new Date().toISOString().slice(0, 10);
    const { rows } = await db.query(
      `SELECT u.id, u.first_name, u.last_name, a.status, a.remarks
       FROM class_students cs JOIN users u ON u.id = cs.student_id
       LEFT JOIN attendance a ON a.student_id = u.id AND a.class_id = $1 AND a.date = $2 AND a.period_number IS NULL
       WHERE cs.class_id = $1 AND cs.status = 'active'
       ORDER BY u.last_name, u.first_name`,
      [c.id, date]
    );
    res.json({ success: true, data: { classe: c.name, date, eleves: rows, faite: rows.some((r) => r.status) } });
  } catch (e) {
    next(e);
  }
});

// PUT /api/notes/appel/:classId { date, presences: [{ studentId, statut }] }
// Les parents des eleves absents sont notifies.
router.put("/appel/:classId", async (req, res, next) => {
  try {
    const c = await verifierClasse(req.user, entier(req.params.classId));
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.date || "") ? req.body.date : new Date().toISOString().slice(0, 10);
    const liste = (Array.isArray(req.body?.presences) ? req.body.presences : []).filter((p) =>
      ["present", "absent", "late", "excused"].includes(p.statut)
    );
    const avant = await db.query(
      "SELECT student_id, status FROM attendance WHERE class_id = $1 AND date = $2 AND period_number IS NULL",
      [c.id, date]
    );
    const ancien = new Map(avant.rows.map((r) => [r.student_id, r.status]));
    await db.query(
      `INSERT INTO attendance (student_id, class_id, academic_year_id, date, status, marked_by)
       SELECT x.id, $1, $2, $3, x.statut, $4 FROM unnest($5::int[], $6::text[]) AS x(id, statut)
       WHERE x.id IN (SELECT student_id FROM class_students WHERE class_id = $1 AND status = 'active')
       ON CONFLICT (student_id, class_id, date) WHERE period_number IS NULL
       DO UPDATE SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by, updated_at = NOW()`,
      [c.id, c.academic_year_id, date, req.user.id, liste.map((p) => entier(p.studentId)), liste.map((p) => p.statut)]
    );
    // Nouveaux absents : leurs parents sont prevenus
    const absents = liste.filter((p) => p.statut === "absent" && ancien.get(entier(p.studentId)) !== "absent").map((p) => entier(p.studentId));
    if (absents.length) {
      const jour = new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
      const { rows } = await db.query(
        `SELECT l.parent_id, u.first_name, u.last_name FROM parent_student_links l JOIN users u ON u.id = l.student_id
         WHERE l.student_id = ANY($1)`,
        [absents]
      );
      for (const r of rows) {
        await notifierUtilisateur(r.parent_id, {
          title: "Absence signalée",
          message: `${r.first_name} ${r.last_name} était absent(e) le ${jour} (${c.name}).`,
          type: "attendance",
          priority: "high",
          data: { lien: "/" },
        }).catch(() => {});
      }
    }
    res.json({ success: true, data: { enregistres: liste.length, absentsSignales: absents.length } });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
