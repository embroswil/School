// modules/notes/routes.js
// Notes (systeme camerounais : 6 sequences, 2 par trimestre, notes sur 20,
// coefficients par matiere) et appel (presences) d'une classe.
// Qui fait quoi (pratique des lycees camerounais) :
// - l'enseignant fait l'appel en classe et publie les notes de SES matieres ;
// - le professeur principal d'une classe gere les coefficients et les
//   resultats (bulletins) de cette classe ;
// - l'administration de l'etablissement consulte tout, sans saisir.
const express = require("express");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate } = require("../../middlewares/auth.middleware");
const { notifierUtilisateur } = require("../../utils/notifier");

router.use(authenticate);

const entier = (v) => parseInt(v, 10);
const TRIMESTRE = (seq) => Math.ceil(seq / 2);

// Droits sur une classe. mode :
// - "lecture"  : administration, professeur principal, enseignant affecte ;
// - "saisie"   : enseignant affecte a la classe (pour la matiere, si precisee) ;
// - "bulletin" : professeur principal de la classe.
const verifierClasse = async (u, classId, subjectId = null, mode = "lecture") => {
  if (!["principal", "teacher", "admin"].includes(u.role)) throw new ApiError(403, "Accès réservé");
  const { rows } = await db.query(
    `SELECT c.id, c.name, c.academic_year_id, c.class_teacher_id, ay.school_id FROM classes c
     JOIN academic_years ay ON ay.id = c.academic_year_id WHERE c.id = $1`,
    [classId]
  );
  const c = rows[0];
  if (!c || (u.role !== "admin" && c.school_id !== u.schoolId)) throw new ApiError(404, "Classe introuvable");
  const estPP = u.role === "teacher" && c.class_teacher_id === u.id;
  c.estProfPrincipal = estPP;
  if (mode === "bulletin") {
    if (!estPP) throw new ApiError(403, "Réservé au professeur principal de la classe");
    return c;
  }
  if (u.role === "teacher") {
    const a = await db.query(
      "SELECT 1 FROM class_subjects WHERE class_id = $1 AND teacher_id = $2 AND ($3::int IS NULL OR subject_id = $3) LIMIT 1",
      [classId, u.id, subjectId]
    );
    if (!a.rows[0] && !(mode === "lecture" && estPP)) throw new ApiError(403, "Vous n'êtes pas affecté à cette classe pour cette matière");
  } else if (mode === "saisie") {
    throw new ApiError(403, "La saisie est faite par les enseignants de la classe");
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
      [c.id, c.school_id, req.user.role === "teacher" && !c.estProfPrincipal ? req.user.id : null]
    );
    const evals = await db.query(
      `SELECT e.id, e.subject_id, e.sequence, e.titre, e.date_eval, e.bareme, e.publiee, s.name AS matiere,
              (SELECT COUNT(*)::int FROM notes_eleves n WHERE n.evaluation_id = e.id AND (n.note IS NOT NULL OR n.absent)) AS saisies,
              (SELECT ROUND(AVG(n.note * 20 / e.bareme), 2) FROM notes_eleves n WHERE n.evaluation_id = e.id AND n.note IS NOT NULL) AS moyenne
       FROM evaluations e JOIN subjects s ON s.id = e.subject_id
       WHERE e.class_id = $1 AND ($2::int IS NULL OR e.subject_id IN
         (SELECT subject_id FROM class_subjects WHERE class_id = $1 AND teacher_id = $2))
       ORDER BY e.sequence DESC, e.created_at DESC`,
      [c.id, req.user.role === "teacher" && !c.estProfPrincipal ? req.user.id : null]
    );
    const mesMatieres =
      req.user.role === "teacher"
        ? (await db.query("SELECT subject_id FROM class_subjects WHERE class_id = $1 AND teacher_id = $2", [c.id, req.user.id])).rows.map((r) => r.subject_id)
        : [];
    const pp = c.class_teacher_id
      ? (await db.query("SELECT id, first_name, last_name FROM users WHERE id = $1", [c.class_teacher_id])).rows[0] || null
      : null;
    const nb = await db.query("SELECT COUNT(*)::int AS n FROM class_students WHERE class_id = $1 AND status = 'active'", [c.id]);
    res.json({
      success: true,
      data: {
        classe: { id: c.id, name: c.name, eleves: nb.rows[0].n, professeurPrincipal: pp },
        matieres: matieres.rows,
        evaluations: evals.rows,
        droits: {
          saisie: req.user.role === "teacher" && mesMatieres.length > 0,
          mesMatieres,
          bulletin: c.estProfPrincipal,
          resultats: c.estProfPrincipal || req.user.role !== "teacher",
          appel: req.user.role === "teacher" && mesMatieres.length > 0,
        },
      },
    });
  } catch (e) {
    next(e);
  }
});

// PUT /api/notes/classes/:id/coefficients { coefficients: { subjectId: coef } } (etablissement)
router.put("/classes/:id/coefficients", async (req, res, next) => {
  try {
    const c = await verifierClasse(req.user, entier(req.params.id), null, "bulletin");
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
    const c = await verifierClasse(req.user, classId, subjectId, "saisie");
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

const chargerEvaluation = async (u, id, mode = "lecture") => {
  const { rows } = await db.query(
    `SELECT e.*, s.name AS matiere, c.name AS classe FROM evaluations e
     JOIN subjects s ON s.id = e.subject_id JOIN classes c ON c.id = e.class_id WHERE e.id = $1`,
    [id]
  );
  const e = rows[0];
  if (!e) throw new ApiError(404, "Évaluation introuvable");
  const c = await verifierClasse(u, e.class_id, mode === "saisie" ? e.subject_id : null, mode);
  // En lecture, un enseignant ne voit que ses matieres (sauf le professeur principal)
  if (mode === "lecture" && u.role === "teacher" && !c.estProfPrincipal) await verifierClasse(u, e.class_id, e.subject_id, "saisie");
  e.modifiable = u.role === "teacher" && (await db.query(
    "SELECT 1 FROM class_subjects WHERE class_id = $1 AND subject_id = $2 AND teacher_id = $3", [e.class_id, e.subject_id, u.id]
  )).rows.length > 0;
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
    const e = await chargerEvaluation(req.user, entier(req.params.id), "saisie");
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
    const e = await chargerEvaluation(req.user, entier(req.params.id), "saisie");
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
    const c = await verifierClasse(req.user, entier(req.params.id));
    if (req.user.role === "teacher" && !c.estProfPrincipal) throw new ApiError(403, "Réservé au professeur principal de la classe");
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
// Periode d'appel : heure de debut du cours (ex. 730 pour 07:30), ou null pour l'appel de la journee
const periodeDe = (v) => {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n >= 0 && n <= 2359 ? n : null;
};
const heureTxt = (p) => (p === null ? "" : `${String(Math.floor(p / 100)).padStart(2, "0")}h${String(p % 100).padStart(2, "0")}`);

// GET /api/notes/appel/:classId?date=AAAA-MM-JJ&periode=730
router.get("/appel/:classId", async (req, res, next) => {
  try {
    const c = await verifierClasse(req.user, entier(req.params.classId));
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || "") ? req.query.date : new Date().toISOString().slice(0, 10);
    const periode = periodeDe(req.query.periode);
    // Cours du jour d'apres l'emploi du temps (ceux de l'enseignant s'il s'agit d'un enseignant)
    const jour = new Date(`${date}T12:00:00`).getDay(); // 0 = dimanche
    const cours = (
      await db.query(
        `SELECT to_char(cr.debut, 'HH24MI')::int AS periode, to_char(cr.debut, 'HH24:MI') AS debut, to_char(cr.fin, 'HH24:MI') AS fin, s.name AS matiere,
                EXISTS (SELECT 1 FROM attendance a WHERE a.class_id = $1 AND a.date = $3 AND a.period_number = to_char(cr.debut, 'HH24MI')::int) AS fait
         FROM creneaux cr LEFT JOIN subjects s ON s.id = cr.subject_id
         LEFT JOIN class_subjects cs ON cs.class_id = cr.class_id AND cs.subject_id = cr.subject_id
         WHERE cr.class_id = $1 AND cr.jour = $2 AND ($4::int IS NULL OR cs.teacher_id = $4)
         ORDER BY cr.debut`,
        [c.id, jour, date, req.user.role === "teacher" ? req.user.id : null]
      )
    ).rows;
    const { rows } = await db.query(
      `SELECT u.id, u.first_name, u.last_name, a.status, a.remarks
       FROM class_students cs JOIN users u ON u.id = cs.student_id
       LEFT JOIN attendance a ON a.student_id = u.id AND a.class_id = $1 AND a.date = $2 AND a.period_number IS NOT DISTINCT FROM $3::int
       WHERE cs.class_id = $1 AND cs.status = 'active'
       ORDER BY u.last_name, u.first_name`,
      [c.id, date, periode]
    );
    // Pour l'administration : resume de la journee (toutes les heures)
    const resume = (
      await db.query(
        `SELECT a.period_number AS periode, COUNT(*) FILTER (WHERE a.status = 'absent')::int AS absents,
                COUNT(*) FILTER (WHERE a.status = 'late')::int AS retards
         FROM attendance a WHERE a.class_id = $1 AND a.date = $2 GROUP BY a.period_number ORDER BY a.period_number NULLS FIRST`,
        [c.id, date]
      )
    ).rows.map((r) => ({ ...r, heure: r.periode === null ? "Journée" : heureTxt(r.periode) }));
    res.json({
      success: true,
      data: { classe: c.name, date, periode, cours, resume, eleves: rows, faite: rows.some((r) => r.status), modifiable: req.user.role === "teacher" },
    });
  } catch (e) {
    next(e);
  }
});

// PUT /api/notes/appel/:classId { date, periode, presences: [{ studentId, statut }] }
// L'appel est fait en classe par l'enseignant, heure par heure. Les parents des absents sont prevenus.
router.put("/appel/:classId", async (req, res, next) => {
  try {
    const c = await verifierClasse(req.user, entier(req.params.classId), null, "saisie");
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.date || "") ? req.body.date : new Date().toISOString().slice(0, 10);
    const periode = periodeDe(req.body?.periode);
    const liste = (Array.isArray(req.body?.presences) ? req.body.presences : []).filter((p) =>
      ["present", "absent", "late", "excused"].includes(p.statut)
    );
    const avant = await db.query(
      "SELECT student_id, status FROM attendance WHERE class_id = $1 AND date = $2 AND period_number IS NOT DISTINCT FROM $3::int",
      [c.id, date, periode]
    );
    const ancien = new Map(avant.rows.map((r) => [r.student_id, r.status]));
    const conflit = periode === null ? "(student_id, class_id, date) WHERE period_number IS NULL" : "(student_id, class_id, date, period_number) WHERE period_number IS NOT NULL";
    await db.query(
      `INSERT INTO attendance (student_id, class_id, academic_year_id, date, period_number, status, marked_by)
       SELECT x.id, $1, $2, $3, $7::int, x.statut, $4 FROM unnest($5::int[], $6::text[]) AS x(id, statut)
       WHERE x.id IN (SELECT student_id FROM class_students WHERE class_id = $1 AND status = 'active')
       ON CONFLICT ${conflit}
       DO UPDATE SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by, updated_at = NOW()`,
      [c.id, c.academic_year_id, date, req.user.id, liste.map((p) => entier(p.studentId)), liste.map((p) => p.statut), periode]
    );
    const absents = liste.filter((p) => p.statut === "absent" && ancien.get(entier(p.studentId)) !== "absent").map((p) => entier(p.studentId));
    if (absents.length) {
      const jour = new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
      const { rows } = await db.query(
        `SELECT l.parent_id, u.id AS eleve, u.first_name, u.last_name FROM parent_student_links l JOIN users u ON u.id = l.student_id
         WHERE l.student_id = ANY($1)`,
        [absents]
      );
      for (const r of rows) {
        await notifierUtilisateur(r.parent_id, {
          title: "Absence signalée",
          message: `${r.first_name} ${r.last_name} était absent(e) le ${jour}${periode !== null ? ` au cours de ${heureTxt(periode)}` : ""} (${c.name}).`,
          type: "attendance",
          priority: "high",
          data: { lien: `/suivi/${r.eleve}` },
        }).catch(() => {});
      }
    }
    res.json({ success: true, data: { enregistres: liste.length, absentsSignales: absents.length } });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------- bulletins

const APPRECIATION = (m) =>
  m === null ? "" : m >= 18 ? "Excellent" : m >= 16 ? "Très bien" : m >= 14 ? "Bien" : m >= 12 ? "Assez bien" : m >= 10 ? "Passable" : m >= 8 ? "Insuffisant" : "Faible";
const arrondi = (x) => (x === null || x === undefined ? null : Math.round(x * 100) / 100);
const rangs = (liste, cle) => {
  const tri = liste.filter((e) => e[cle] !== null).sort((a, b) => b[cle] - a[cle]);
  const r = new Map();
  tri.forEach((e, i) => r.set(e.id, i > 0 && tri[i - 1][cle] === e[cle] ? r.get(tri[i - 1].id) : i + 1));
  return r;
};

// GET /api/notes/classes/:id/bulletins?trimestre=1
// Bulletins de tous les eleves de la classe (professeur principal ou administration)
router.get("/classes/:id/bulletins", async (req, res, next) => {
  try {
    const c = await verifierClasse(req.user, entier(req.params.id));
    if (req.user.role === "teacher" && !c.estProfPrincipal) throw new ApiError(403, "Réservé au professeur principal de la classe");
    const tri = Math.min(3, Math.max(1, entier(req.query.trimestre) || 1));
    const seqs = [tri * 2 - 1, tri * 2];
    const ecole = (await db.query("SELECT name, city, type, photo FROM schools WHERE id = $1", [c.school_id])).rows[0];
    const annee = (await db.query("SELECT name FROM academic_years WHERE id = $1", [c.academic_year_id])).rows[0];
    const terme = (await db.query("SELECT start_date, end_date FROM terms WHERE academic_year_id = $1 AND term_number = $2", [c.academic_year_id, tri])).rows[0];
    const pp = c.class_teacher_id
      ? (await db.query("SELECT first_name, last_name FROM users WHERE id = $1", [c.class_teacher_id])).rows[0]
      : null;
    // Matieres de la classe (avec enseignant et coefficient) ayant au moins une note
    const matieres = (
      await db.query(
        `SELECT s.id, s.name, COALESCE(cs.coefficient, 2) AS coef, u.first_name, u.last_name
         FROM subjects s
         LEFT JOIN class_subjects cs ON cs.class_id = $1 AND cs.subject_id = s.id
         LEFT JOIN users u ON u.id = cs.teacher_id
         WHERE s.id IN (SELECT subject_id FROM evaluations WHERE class_id = $1 AND sequence = ANY($2))
         ORDER BY s.name`,
        [c.id, seqs]
      )
    ).rows;
    // Moyenne de chaque eleve, par matiere et par sequence (sur 20)
    const notes = (
      await db.query(
        `SELECT x.student_id, e.subject_id, e.sequence, AVG(x.note * 20 / e.bareme) AS moy
         FROM notes_eleves x JOIN evaluations e ON e.id = x.evaluation_id
         WHERE e.class_id = $1 AND e.sequence = ANY($2) AND x.note IS NOT NULL
         GROUP BY x.student_id, e.subject_id, e.sequence`,
        [c.id, seqs]
      )
    ).rows;
    const eleves = (
      await db.query(
        `SELECT u.id, u.first_name, u.last_name, sr.admission_number, sr.date_of_birth, sr.gender,
                (SELECT COUNT(*)::int FROM attendance a WHERE a.student_id = u.id AND a.status = 'absent'
                   AND ($2::date IS NULL OR a.date BETWEEN $2 AND $3)) AS absences,
                (SELECT COUNT(*)::int FROM attendance a WHERE a.student_id = u.id AND a.status = 'late'
                   AND ($2::date IS NULL OR a.date BETWEEN $2 AND $3)) AS retards
         FROM class_students cs JOIN users u ON u.id = cs.student_id
         LEFT JOIN student_records sr ON sr.student_id = u.id
         WHERE cs.class_id = $1 AND cs.status = 'active'
         ORDER BY u.last_name, u.first_name`,
        [c.id, terme?.start_date || null, terme?.end_date || null]
      )
    ).rows;
    const cle = (e, s) => `${e}|${s}`;
    const parEleveMatiere = new Map();
    for (const n of notes) {
      const k = cle(n.student_id, n.subject_id);
      const v = parEleveMatiere.get(k) || {};
      v[n.sequence] = Number(n.moy);
      parEleveMatiere.set(k, v);
    }
    // Lignes par eleve
    const bulletins = eleves.map((e) => {
      let total = 0;
      let coefs = 0;
      const lignes = matieres.map((m) => {
        const v = parEleveMatiere.get(cle(e.id, m.id)) || {};
        const s1 = v[seqs[0]] ?? null;
        const s2 = v[seqs[1]] ?? null;
        const presentes = [s1, s2].filter((x) => x !== null);
        const moyenne = presentes.length ? presentes.reduce((a, b) => a + b, 0) / presentes.length : null;
        if (moyenne !== null) {
          total += moyenne * Number(m.coef);
          coefs += Number(m.coef);
        }
        return { matiereId: m.id, s1: arrondi(s1), s2: arrondi(s2), moyenne: arrondi(moyenne), coef: Number(m.coef), total: moyenne === null ? null : arrondi(moyenne * Number(m.coef)) };
      });
      return { ...e, lignes, totalPoints: arrondi(total), totalCoefs: coefs, moyenne: coefs ? arrondi(total / coefs) : null };
    });
    // Rangs : general et par matiere
    const rg = rangs(bulletins, "moyenne");
    const rangsMatiere = new Map(
      matieres.map((m) => [
        m.id,
        rangs(
          bulletins.map((b) => ({ id: b.id, v: b.lignes.find((l) => l.matiereId === m.id).moyenne })),
          "v"
        ),
      ])
    );
    const moyennes = bulletins.map((b) => b.moyenne).filter((x) => x !== null);
    const stats = {
      effectif: eleves.length,
      classes: moyennes.length,
      moyenneClasse: moyennes.length ? arrondi(moyennes.reduce((a, b) => a + b, 0) / moyennes.length) : null,
      plusHaute: moyennes.length ? Math.max(...moyennes) : null,
      plusBasse: moyennes.length ? Math.min(...moyennes) : null,
      reussite: moyennes.length ? Math.round((moyennes.filter((x) => x >= 10).length / moyennes.length) * 100) : null,
    };
    const appr = new Map(
      (
        await db.query("SELECT student_id, appreciation FROM appreciations_bulletin WHERE class_id = $1 AND trimestre = $2", [c.id, tri])
      ).rows.map((r) => [r.student_id, r.appreciation])
    );
    for (const b of bulletins) {
      b.rang = rg.get(b.id) || null;
      b.appreciation = APPRECIATION(b.moyenne);
      b.appreciationPP = appr.get(b.id) || "";
      for (const l of b.lignes) {
        l.rang = rangsMatiere.get(l.matiereId).get(b.id) || null;
        l.appreciation = APPRECIATION(l.moyenne);
      }
    }
    if (tri === 3) {
      const [t1, t2] = await Promise.all([moyennesTrimestre(c.id, 1), moyennesTrimestre(c.id, 2)]);
      const dec = new Map(
        (await db.query("SELECT student_id, decision FROM decisions_annuelles WHERE class_id = $1", [c.id])).rows.map((r) => [r.student_id, r.decision])
      );
      for (const b of bulletins) {
        const ts = [t1.get(b.id), t2.get(b.id), b.moyenne].filter((x) => x !== undefined && x !== null);
        b.annuelle = ts.length ? arrondi(ts.reduce((x, y) => x + y, 0) / ts.length) : null;
        b.decision = dec.get(b.id) ? DECISIONS[dec.get(b.id)] : null;
      }
    }
    res.json({
      success: true,
      data: {
        ecole,
        annee: annee?.name,
        trimestre: tri,
        sequences: seqs,
        classe: c.name,
        professeurPrincipal: pp ? `${pp.first_name} ${pp.last_name}` : null,
        peutApprecier: c.estProfPrincipal,
        matieres: matieres.map((m) => ({ id: m.id, nom: m.name, coef: Number(m.coef), enseignant: m.last_name ? `${m.first_name} ${m.last_name}` : null })),
        stats,
        bulletins,
      },
    });
  } catch (e) {
    next(e);
  }
});

// PUT /api/notes/classes/:id/appreciations { studentId, trimestre, appreciation } (professeur principal)
router.put("/classes/:id/appreciations", async (req, res, next) => {
  try {
    const c = await verifierClasse(req.user, entier(req.params.id), null, "bulletin");
    const studentId = entier(req.body?.studentId);
    const tri = entier(req.body?.trimestre);
    if (!(tri >= 1 && tri <= 3)) throw new ApiError(400, "Trimestre invalide");
    const ok = await db.query("SELECT 1 FROM class_students WHERE class_id = $1 AND student_id = $2", [c.id, studentId]);
    if (!ok.rows[0]) throw new ApiError(404, "Élève introuvable dans cette classe");
    const texte = String(req.body?.appreciation || "").trim().slice(0, 400) || null;
    await db.query(
      `INSERT INTO appreciations_bulletin (class_id, student_id, trimestre, appreciation, auteur_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (class_id, student_id, trimestre) DO UPDATE SET appreciation = EXCLUDED.appreciation, auteur_id = EXCLUDED.auteur_id, updated_at = NOW()`,
      [c.id, studentId, tri, texte, req.user.id]
    );
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------- devoirs (cahier de textes)

// GET /api/notes/classes/:id/devoirs : devoirs a venir (et des 7 derniers jours)
router.get("/classes/:id/devoirs", async (req, res, next) => {
  try {
    const c = await verifierClasse(req.user, entier(req.params.id));
    const { rows } = await db.query(
      `SELECT d.id, d.titre, d.consigne, d.pour_le, d.created_at, d.subject_id, s.name AS matiere, d.teacher_id,
              u.first_name, u.last_name
       FROM devoirs d JOIN subjects s ON s.id = d.subject_id LEFT JOIN users u ON u.id = d.teacher_id
       WHERE d.class_id = $1 AND (d.pour_le IS NULL OR d.pour_le >= CURRENT_DATE - 7)
       ORDER BY d.pour_le NULLS LAST, d.created_at DESC`,
      [c.id]
    );
    res.json({ success: true, data: rows.map((d) => ({ ...d, mien: d.teacher_id === req.user.id })) });
  } catch (e) {
    next(e);
  }
});

// POST /api/notes/classes/:id/devoirs { subjectId, titre, consigne, pourLe } (enseignant de la matiere)
router.post("/classes/:id/devoirs", async (req, res, next) => {
  try {
    const subjectId = entier(req.body?.subjectId);
    const c = await verifierClasse(req.user, entier(req.params.id), subjectId, "saisie");
    const titre = String(req.body?.titre || "").trim().slice(0, 200);
    if (!titre) throw new ApiError(400, "Indiquez le devoir (ex. Exercices 3 et 4 page 52)");
    const pourLe = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.pourLe || "") ? req.body.pourLe : null;
    const { rows } = await db.query(
      `INSERT INTO devoirs (school_id, class_id, subject_id, teacher_id, titre, consigne, pour_le)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [c.school_id, c.id, subjectId, req.user.id, titre, String(req.body?.consigne || "").trim().slice(0, 2000) || null, pourLe]
    );
    // Notification aux eleves (avec compte) et aux parents de la classe
    const mat = (await db.query("SELECT name FROM subjects WHERE id = $1", [subjectId])).rows[0]?.name || "";
    await db
      .query(
        `INSERT INTO notifications (user_id, title, message, type, data)
         SELECT DISTINCT dest, $2, $3, 'reminder', '{"lien":"/notes"}'::jsonb FROM (
           SELECT cs.student_id AS dest FROM class_students cs JOIN users u ON u.id = cs.student_id
           WHERE cs.class_id = $1 AND cs.status = 'active' AND u.email NOT LIKE '%@inscrit.school'
           UNION
           SELECT l.parent_id FROM parent_student_links l JOIN class_students cs ON cs.student_id = l.student_id
           WHERE cs.class_id = $1 AND cs.status = 'active') x`,
        [c.id, `Devoir de ${mat}`, `${titre}${pourLe ? ` · pour le ${new Date(pourLe + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}` : ""}`]
      )
      .catch(() => {});
    res.status(201).json({ success: true, data: { id: rows[0].id } });
  } catch (e) {
    next(e);
  }
});

router.delete("/devoirs/:id", async (req, res, next) => {
  try {
    const r = await db.query("DELETE FROM devoirs WHERE id = $1 AND teacher_id = $2", [entier(req.params.id), req.user.id]);
    if (!r.rowCount) throw new ApiError(404, "Devoir introuvable");
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------- conseil de classe de fin d'annee

// Moyenne (sur 20, ponderee par les coefficients) de chaque eleve pour un trimestre
const moyennesTrimestre = async (classId, tri) => {
  const { rows } = await db.query(
    `WITH n AS (
       SELECT x.student_id, e.subject_id, AVG(x.note * 20 / e.bareme) AS moy
       FROM notes_eleves x JOIN evaluations e ON e.id = x.evaluation_id
       WHERE e.class_id = $1 AND e.sequence = ANY($2) AND x.note IS NOT NULL
       GROUP BY x.student_id, e.subject_id)
     SELECT n.student_id, SUM(n.moy * COALESCE(cs.coefficient, 2)) / SUM(COALESCE(cs.coefficient, 2)) AS moyenne
     FROM n LEFT JOIN class_subjects cs ON cs.class_id = $1 AND cs.subject_id = n.subject_id
     GROUP BY n.student_id`,
    [classId, [tri * 2 - 1, tri * 2]]
  );
  return new Map(rows.map((r) => [r.student_id, Number(r.moyenne)]));
};
const DECISIONS = { admis: "Admis(e) en classe supérieure", admis_sous_reserve: "Admis(e) sous réserve", redouble: "Redouble", exclu: "Exclu(e)" };

// GET /api/notes/classes/:id/annuel : moyennes des 3 trimestres, moyenne annuelle, rang, decision
router.get("/classes/:id/annuel", async (req, res, next) => {
  try {
    const c = await verifierClasse(req.user, entier(req.params.id));
    if (req.user.role === "teacher" && !c.estProfPrincipal) throw new ApiError(403, "Réservé au professeur principal de la classe");
    const [t1, t2, t3] = await Promise.all([1, 2, 3].map((t) => moyennesTrimestre(c.id, t)));
    const eleves = await elevesDe(c.id);
    const decisions = new Map(
      (await db.query("SELECT student_id, decision, observation FROM decisions_annuelles WHERE class_id = $1", [c.id])).rows.map((r) => [r.student_id, r])
    );
    const liste = eleves.map((e) => {
      const ts = [t1.get(e.id), t2.get(e.id), t3.get(e.id)].map((x) => (x === undefined ? null : arrondi(x)));
      const presentes = ts.filter((x) => x !== null);
      const annuelle = presentes.length ? arrondi(presentes.reduce((a, b) => a + b, 0) / presentes.length) : null;
      const d = decisions.get(e.id);
      return {
        id: e.id,
        prenom: e.first_name,
        nom: e.last_name,
        trimestres: ts,
        annuelle,
        decision: d?.decision || null,
        observation: d?.observation || "",
        proposition: annuelle === null ? null : annuelle >= 10 ? "admis" : annuelle >= 9 ? "admis_sous_reserve" : "redouble",
      };
    });
    const rg = rangs(liste, "annuelle");
    liste.forEach((e) => (e.rang = rg.get(e.id) || null));
    liste.sort((a, b) => (a.rang || 9999) - (b.rang || 9999));
    const moy = liste.map((e) => e.annuelle).filter((x) => x !== null);
    res.json({
      success: true,
      data: {
        classe: c.name,
        modifiable: c.estProfPrincipal || ["principal", "admin"].includes(req.user.role),
        decisions: DECISIONS,
        stats: {
          moyenneClasse: moy.length ? arrondi(moy.reduce((a, b) => a + b, 0) / moy.length) : null,
          admis: liste.filter((e) => (e.decision || e.proposition) === "admis").length,
          redoublants: liste.filter((e) => (e.decision || e.proposition) === "redouble").length,
        },
        eleves: liste,
      },
    });
  } catch (e) {
    next(e);
  }
});

// PUT /api/notes/classes/:id/decisions { decisions: [{ studentId, decision, observation }] }
router.put("/classes/:id/decisions", async (req, res, next) => {
  try {
    const c = await verifierClasse(req.user, entier(req.params.id));
    if (!(c.estProfPrincipal || ["principal", "admin"].includes(req.user.role))) throw new ApiError(403, "Réservé au professeur principal ou à l'administration");
    const liste = (Array.isArray(req.body?.decisions) ? req.body.decisions : []).filter((d) => Object.keys(DECISIONS).includes(d.decision));
    for (const d of liste) {
      await db.query(
        `INSERT INTO decisions_annuelles (class_id, student_id, decision, observation, auteur_id, updated_at)
         SELECT $1, $2, $3, $4, $5, NOW() WHERE EXISTS (SELECT 1 FROM class_students WHERE class_id = $1 AND student_id = $2)
         ON CONFLICT (class_id, student_id) DO UPDATE SET decision = EXCLUDED.decision, observation = EXCLUDED.observation, auteur_id = EXCLUDED.auteur_id, updated_at = NOW()`,
        [c.id, entier(d.studentId), d.decision, String(d.observation || "").trim().slice(0, 300) || null, req.user.id]
      );
    }
    res.json({ success: true, data: { enregistrees: liste.length } });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------- espace enseignant

// GET /api/notes/mes-classes : classes de l'enseignant (matieres, prof principal)
router.get("/mes-classes", async (req, res, next) => {
  try {
    if (req.user.role !== "teacher") throw new ApiError(403, "Réservé aux enseignants");
    const { rows } = await db.query(
      `SELECT c.id, c.name,
              COALESCE((SELECT json_agg(s.name ORDER BY s.name) FROM class_subjects cs JOIN subjects s ON s.id = cs.subject_id
                        WHERE cs.class_id = c.id AND cs.teacher_id = $1), '[]') AS matieres,
              (c.class_teacher_id = $1) AS prof_principal,
              (SELECT COUNT(*)::int FROM class_students x WHERE x.class_id = c.id AND x.status = 'active') AS eleves,
              EXISTS (SELECT 1 FROM attendance a WHERE a.class_id = c.id AND a.date = CURRENT_DATE AND a.marked_by = $1) AS appel_fait
       FROM classes c JOIN academic_years ay ON ay.id = c.academic_year_id
       WHERE ay.school_id = $2 AND ay.is_current
         AND (c.class_teacher_id = $1 OR EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.class_id = c.id AND cs.teacher_id = $1))
       ORDER BY c.name`,
      [req.user.id, req.user.schoolId]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

// GET /api/notes/mes-affectations : matieres et classes choisies + toutes celles de l'etablissement
router.get("/mes-affectations", async (req, res, next) => {
  try {
    if (req.user.role !== "teacher") throw new ApiError(403, "Réservé aux enseignants");
    const { matieresEcole } = require("../../utils/matieres");
    const { assurerAnneeScolaire } = require("../../utils/annees");
    const annee = await assurerAnneeScolaire(req.user.schoolId);
    const classes = await db.query("SELECT id, name FROM classes WHERE academic_year_id = $1 ORDER BY name", [annee.id]);
    const miennes = await db.query(
      "SELECT DISTINCT class_id, subject_id FROM class_subjects WHERE teacher_id = $1 AND academic_year_id = $2",
      [req.user.id, annee.id]
    );
    res.json({
      success: true,
      data: {
        matieres: await matieresEcole(req.user.schoolId),
        classes: classes.rows,
        matiereIds: [...new Set(miennes.rows.map((r) => r.subject_id))],
        classeIds: [...new Set(miennes.rows.map((r) => r.class_id))],
      },
    });
  } catch (e) {
    next(e);
  }
});

// PUT /api/notes/mes-affectations { matiereIds, classeIds } : l'enseignant choisit lui-meme
router.put("/mes-affectations", async (req, res, next) => {
  try {
    if (req.user.role !== "teacher") throw new ApiError(403, "Réservé aux enseignants");
    const { assurerAnneeScolaire } = require("../../utils/annees");
    const annee = await assurerAnneeScolaire(req.user.schoolId);
    const ids = (v) => (Array.isArray(v) ? v.map((x) => parseInt(x, 10)).filter((x) => x > 0) : []);
    const mat = (await db.query("SELECT id FROM subjects WHERE id = ANY($1) AND school_id = $2", [ids(req.body?.matiereIds), req.user.schoolId])).rows.map((r) => r.id);
    const cls = (await db.query("SELECT id FROM classes WHERE id = ANY($1) AND academic_year_id = $2", [ids(req.body?.classeIds), annee.id])).rows.map((r) => r.id);
    if (!mat.length || !cls.length) throw new ApiError(400, "Choisissez au moins une matière et une classe");
    // Retire les affectations abandonnees, puis ajoute les nouvelles
    await db.query(
      `UPDATE class_subjects SET teacher_id = NULL
       WHERE teacher_id = $1 AND academic_year_id = $2 AND NOT (class_id = ANY($3) AND subject_id = ANY($4))`,
      [req.user.id, annee.id, cls, mat]
    );
    const r = await db.query(
      `INSERT INTO class_subjects (class_id, subject_id, teacher_id, academic_year_id, is_active)
       SELECT c, s, $3, $4, true FROM unnest($1::int[]) c CROSS JOIN unnest($2::int[]) s
       ON CONFLICT (class_id, subject_id, academic_year_id)
       DO UPDATE SET teacher_id = COALESCE(class_subjects.teacher_id, EXCLUDED.teacher_id), is_active = true
       RETURNING (teacher_id = $3) AS moi`,
      [cls, mat, req.user.id, annee.id]
    );
    const occupees = r.rows.filter((x) => !x.moi).length;
    res.json({ success: true, data: { affectees: r.rows.length - occupees, dejaPrises: occupees } });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
