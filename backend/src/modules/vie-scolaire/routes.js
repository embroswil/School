// modules/vie-scolaire/routes.js
// Emploi du temps des classes et discipline (sanctions).
const express = require("express");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate } = require("../../middlewares/auth.middleware");
const { notifierUtilisateur } = require("../../utils/notifier");
const { lireDocument, normaliser } = require("../../utils/ia");

router.use(authenticate);
const entier = (v) => parseInt(v, 10);
const HEURE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const classeDeLEcole = async (u, classId) => {
  const { rows } = await db.query(
    `SELECT c.id, c.name, c.class_teacher_id, ay.school_id FROM classes c JOIN academic_years ay ON ay.id = c.academic_year_id WHERE c.id = $1`,
    [classId]
  );
  const c = rows[0];
  if (!c || (u.role !== "admin" && c.school_id !== u.schoolId)) throw new ApiError(404, "Classe introuvable");
  return c;
};
// Eleves consultables par un parent / un eleve
const accesEleve = async (u, id) => {
  if (u.role === "student" && u.id === id) return true;
  if (u.role === "parent") {
    const r = await db.query("SELECT 1 FROM parent_student_links WHERE parent_id = $1 AND student_id = $2", [u.id, id]);
    if (r.rows[0]) return true;
  }
  if (["principal", "teacher", "admin"].includes(u.role)) {
    const r = await db.query("SELECT 1 FROM users WHERE id = $1 AND ($2::int IS NULL OR school_id = $2)", [id, u.role === "admin" ? null : u.schoolId]);
    if (r.rows[0]) return true;
  }
  throw new ApiError(403, "Accès non autorisé");
};
const classeDeLEleve = async (id) =>
  (
    await db.query(
      `SELECT c.id, c.name FROM class_students cs JOIN classes c ON c.id = cs.class_id
       WHERE cs.student_id = $1 AND cs.status = 'active' ORDER BY cs.enrolled_at DESC LIMIT 1`,
      [id]
    )
  ).rows[0] || null;

const SQL_CRENEAUX = `
  SELECT cr.id, cr.jour, to_char(cr.debut, 'HH24:MI') AS debut, to_char(cr.fin, 'HH24:MI') AS fin, cr.salle,
         cr.subject_id, s.name AS matiere, c.id AS class_id, c.name AS classe,
         u.id AS teacher_id, u.first_name, u.last_name
  FROM creneaux cr JOIN classes c ON c.id = cr.class_id
  LEFT JOIN subjects s ON s.id = cr.subject_id
  LEFT JOIN class_subjects cs ON cs.class_id = cr.class_id AND cs.subject_id = cr.subject_id
  LEFT JOIN users u ON u.id = cs.teacher_id`;

// ---------------------------------------------------------------- emploi du temps

// GET /api/vie-scolaire/emplois/classes/:id
router.get("/emplois/classes/:id", async (req, res, next) => {
  try {
    const c = await classeDeLEcole(req.user, entier(req.params.id));
    const { rows } = await db.query(`${SQL_CRENEAUX} WHERE cr.class_id = $1 ORDER BY cr.jour, cr.debut`, [c.id]);
    res.json({ success: true, data: { classe: c.name, creneaux: rows, modifiable: ["principal", "admin"].includes(req.user.role) } });
  } catch (e) {
    next(e);
  }
});

// PUT /api/vie-scolaire/emplois/classes/:id { creneaux: [{ jour, debut, fin, subjectId, salle }] } (administration)
router.put("/emplois/classes/:id", async (req, res, next) => {
  const client = await db.connect();
  try {
    if (!["principal", "admin"].includes(req.user.role)) throw new ApiError(403, "Réservé à l'administration");
    const c = await classeDeLEcole(req.user, entier(req.params.id));
    const liste = (Array.isArray(req.body?.creneaux) ? req.body.creneaux : []).slice(0, 80);
    for (const x of liste) {
      if (!(entier(x.jour) >= 1 && entier(x.jour) <= 6)) throw new ApiError(400, "Jour invalide");
      if (!HEURE.test(x.debut || "") || !HEURE.test(x.fin || "") || x.debut >= x.fin) throw new ApiError(400, `Horaire invalide (${x.debut || "?"} – ${x.fin || "?"})`);
    }
    await client.query("BEGIN");
    await client.query("DELETE FROM creneaux WHERE class_id = $1", [c.id]);
    for (const x of liste) {
      await client.query(
        `INSERT INTO creneaux (school_id, class_id, jour, debut, fin, subject_id, salle)
         SELECT $1, $2, $3, $4, $5, (SELECT id FROM subjects WHERE id = $6 AND school_id = $1), $7`,
        [c.school_id, c.id, entier(x.jour), x.debut, x.fin, entier(x.subjectId) || null, String(x.salle || "").trim().slice(0, 50) || null]
      );
    }
    await client.query("COMMIT");
    res.json({ success: true, data: { creneaux: liste.length } });
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {}
    next(e);
  } finally {
    client.release();
  }
});

// GET /api/vie-scolaire/emplois/moi : enseignant (ses cours) ; parent/eleve : ?eleve=ID
router.get("/emplois/moi", async (req, res, next) => {
  try {
    const u = req.user;
    if (u.role === "teacher") {
      const { rows } = await db.query(`${SQL_CRENEAUX} WHERE cs.teacher_id = $1 ORDER BY cr.jour, cr.debut`, [u.id]);
      return res.json({ success: true, data: { creneaux: rows } });
    }
    const id = u.role === "student" ? u.id : entier(req.query.eleve);
    await accesEleve(u, id);
    const c = await classeDeLEleve(id);
    if (!c) return res.json({ success: true, data: { creneaux: [] } });
    const { rows } = await db.query(`${SQL_CRENEAUX} WHERE cr.class_id = $1 ORDER BY cr.jour, cr.debut`, [c.id]);
    res.json({ success: true, data: { classe: c.name, creneaux: rows } });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------- discipline

const TYPES = {
  observation: "Observation",
  avertissement: "Avertissement",
  blame: "Blâme",
  retenue: "Retenue",
  convocation_parents: "Convocation des parents",
  exclusion_temporaire: "Exclusion temporaire",
  exclusion_definitive: "Exclusion définitive",
};

// GET /api/vie-scolaire/sanctions/eleves/:id
router.get("/sanctions/eleves/:id", async (req, res, next) => {
  try {
    const id = entier(req.params.id);
    await accesEleve(req.user, id);
    const { rows } = await db.query(
      `SELECT s.id, s.type, s.motif, s.date_faits, s.duree_jours, s.created_at, u.first_name, u.last_name
       FROM sanctions s LEFT JOIN users u ON u.id = s.auteur_id WHERE s.student_id = $1 ORDER BY s.date_faits DESC, s.id DESC`,
      [id]
    );
    res.json({ success: true, data: rows.map((r) => ({ ...r, libelle: TYPES[r.type] || r.type })) });
  } catch (e) {
    next(e);
  }
});

// POST /api/vie-scolaire/sanctions { studentId, type, motif, date, dureeJours }
// Administration, ou professeur principal de la classe de l'eleve. Les parents sont prevenus.
router.post("/sanctions", async (req, res, next) => {
  try {
    const u = req.user;
    const studentId = entier(req.body?.studentId);
    const e = (await db.query("SELECT id, first_name, last_name, school_id FROM users WHERE id = $1 AND role = 'student'", [studentId])).rows[0];
    if (!e || (u.role !== "admin" && e.school_id !== u.schoolId)) throw new ApiError(404, "Élève introuvable");
    if (u.role === "teacher") {
      const c = await classeDeLEleve(studentId);
      const pp = c && (await db.query("SELECT 1 FROM classes WHERE id = $1 AND class_teacher_id = $2", [c.id, u.id])).rows[0];
      const type = req.body?.type;
      if (!pp && type !== "observation") throw new ApiError(403, "Un enseignant peut signaler une observation ; les sanctions sont données par le professeur principal ou l'administration");
    } else if (!["principal", "admin"].includes(u.role)) throw new ApiError(403, "Accès réservé");
    const type = Object.keys(TYPES).includes(req.body?.type) ? req.body.type : null;
    if (!type) throw new ApiError(400, "Type de sanction invalide");
    const motif = String(req.body?.motif || "").trim().slice(0, 1000);
    if (!motif) throw new ApiError(400, "Indiquez le motif");
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.date || "") ? req.body.date : new Date().toISOString().slice(0, 10);
    const duree = entier(req.body?.dureeJours) || null;
    const { rows } = await db.query(
      `INSERT INTO sanctions (school_id, student_id, type, motif, date_faits, duree_jours, auteur_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [e.school_id, studentId, type, motif, date, duree, u.id]
    );
    const parents = await db.query("SELECT parent_id FROM parent_student_links WHERE student_id = $1", [studentId]);
    for (const p of parents.rows) {
      await notifierUtilisateur(p.parent_id, {
        title: `${TYPES[type]} : ${e.first_name} ${e.last_name}`,
        message: `${motif}${duree ? ` (${duree} jour(s))` : ""}`,
        type: "discipline",
        priority: "high",
        data: { lien: `/suivi/${studentId}` },
      }).catch(() => {});
    }
    res.status(201).json({ success: true, data: { id: rows[0].id } });
  } catch (err) {
    next(err);
  }
});

router.delete("/sanctions/:id", async (req, res, next) => {
  try {
    if (!["principal", "admin"].includes(req.user.role)) throw new ApiError(403, "Réservé à l'administration");
    const r = await db.query("DELETE FROM sanctions WHERE id = $1 AND ($2::int IS NULL OR school_id = $2)", [
      entier(req.params.id),
      req.user.role === "admin" ? null : req.user.schoolId,
    ]);
    if (!r.rowCount) throw new ApiError(404, "Sanction introuvable");
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------- discipline par document

// Retrouve l'eleve d'apres son nom (et sa classe si elle est indiquee)
const retrouverEleve = (eleves, nomComplet, classe) => {
  const mots = normaliser(nomComplet).split(" ").filter((m) => m.length > 1);
  if (!mots.length) return { eleve: null, autres: [] };
  const cl = normaliser(classe);
  const scores = eleves
    .map((e) => {
      const nom = normaliser(`${e.last_name} ${e.first_name}`);
      const communs = mots.filter((m) => nom.split(" ").includes(m)).length;
      let score = communs / Math.max(mots.length, nom.split(" ").length);
      if (cl && normaliser(e.classe) === cl) score += 0.3;
      return { e, score, communs };
    })
    .filter((x) => x.communs >= Math.min(2, mots.length))
    .sort((a, b) => b.score - a.score);
  if (!scores.length) return { eleve: null, autres: [] };
  const sur = scores.length === 1 || scores[0].score - scores[1].score >= 0.15;
  const fiche = (x) => ({ id: x.e.id, nom: `${x.e.last_name} ${x.e.first_name}`, classe: x.e.classe });
  return { eleve: sur ? fiche(scores[0]) : null, autres: scores.slice(0, 5).map(fiche) };
};

// POST /api/vie-scolaire/sanctions/lire { images: [dataUrl], texte }
// Lit un document disciplinaire (photo, scan, PDF, Excel) et propose les sanctions, eleve par eleve.
router.post("/sanctions/lire", async (req, res, next) => {
  try {
    const u = req.user;
    if (!["principal", "admin", "teacher"].includes(u.role)) throw new ApiError(403, "Accès réservé");
    const donnees = await lireDocument({
      images: Array.isArray(req.body?.images) ? req.body.images : [],
      texte: req.body?.texte || "",
      consigne: `Ce document provient d'un établissement scolaire camerounais : procès-verbal de conseil de discipline, liste de sanctions, rapport du surveillant, billet d'avertissement, etc. (imprimé ou écrit à la main).
Extrais chaque sanction ou observation concernant un élève. Pour chacune : nom (nom complet de l'élève tel qu'écrit), classe (si indiquée, ex. "3e All"), type (un parmi : observation, avertissement, blame, retenue, convocation_parents, exclusion_temporaire, exclusion_definitive — choisis le plus proche), motif (court, en français), date (AAAA-MM-JJ si présente, sinon vide), dureeJours (nombre de jours pour une exclusion ou une retenue, sinon null).
Format : {"entrees": [{"nom":"","classe":"","type":"","motif":"","date":"","dureeJours":null}]}`,
    });
    const ecole = u.role === "admin" ? null : u.schoolId;
    const eleves = (
      await db.query(
        `SELECT u.id, u.first_name, u.last_name,
                (SELECT c.name FROM class_students cs JOIN classes c ON c.id = cs.class_id
                 WHERE cs.student_id = u.id AND cs.status = 'active' ORDER BY cs.enrolled_at DESC LIMIT 1) AS classe
         FROM users u WHERE u.role = 'student' AND ($1::int IS NULL OR u.school_id = $1)`,
        [ecole]
      )
    ).rows;
    const TYPESOK = Object.keys(TYPES);
    const entrees = (Array.isArray(donnees.entrees) ? donnees.entrees : []).slice(0, 200).map((x) => {
      const trouve = retrouverEleve(eleves, x.nom, x.classe);
      return {
        nomLu: String(x.nom || "").trim(),
        classeLue: String(x.classe || "").trim(),
        type: TYPESOK.includes(x.type) ? x.type : "observation",
        motif: String(x.motif || "").trim().slice(0, 1000),
        date: /^\d{4}-\d{2}-\d{2}$/.test(x.date || "") ? x.date : new Date().toISOString().slice(0, 10),
        dureeJours: parseInt(x.dureeJours, 10) || null,
        eleve: trouve.eleve,
        suggestions: trouve.autres,
      };
    });
    res.json({ success: true, data: entrees });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
