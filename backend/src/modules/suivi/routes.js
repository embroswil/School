// modules/suivi/routes.js
// Suivi scolaire pour les parents (et tuteurs, oncles…) et les eleves :
// notes publiees, moyennes et rang par sequence, absences.
const express = require("express");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate } = require("../../middlewares/auth.middleware");

router.use(authenticate);

const LIENS = { pere: "Père", mere: "Mère", tuteur: "Tuteur", oncle_tante: "Oncle / tante", grand_parent: "Grand-parent", frere_soeur: "Frère / sœur", parent: "Parent", autre: "Proche" };

// Eleves consultables : un parent voit ses enfants relies, un eleve se voit lui-meme
const elevesAccessibles = async (u) => {
  if (u.role === "student") return [{ id: u.id, lien: null }];
  if (u.role === "parent") {
    const { rows } = await db.query("SELECT student_id AS id, relationship AS lien FROM parent_student_links WHERE parent_id = $1", [u.id]);
    return rows;
  }
  return [];
};
const verifierAcces = async (u, id) => {
  const ok = (await elevesAccessibles(u)).find((e) => e.id === id);
  if (!ok) throw new ApiError(403, "Élève non relié à votre compte");
  return ok;
};

const classeActuelle = async (id) =>
  (
    await db.query(
      `SELECT c.id, c.name FROM class_students cs JOIN classes c ON c.id = cs.class_id
       WHERE cs.student_id = $1 AND cs.status = 'active' ORDER BY cs.enrolled_at DESC LIMIT 1`,
      [id]
    )
  ).rows[0] || null;

// Moyennes (sur 20, ponderees par les coefficients) de tous les eleves d'une
// classe pour des sequences donnees, a partir des evaluations PUBLIEES.
const moyennesClasse = async (classId, sequences) => {
  const { rows } = await db.query(
    `WITH n AS (
       SELECT x.student_id, e.subject_id, AVG(x.note * 20 / e.bareme) AS moy
       FROM notes_eleves x JOIN evaluations e ON e.id = x.evaluation_id
       WHERE e.class_id = $1 AND e.publiee AND e.sequence = ANY($2) AND x.note IS NOT NULL
       GROUP BY x.student_id, e.subject_id)
     SELECT n.student_id, SUM(n.moy * COALESCE(cs.coefficient, 2)) / SUM(COALESCE(cs.coefficient, 2)) AS moyenne
     FROM n LEFT JOIN class_subjects cs ON cs.class_id = $1 AND cs.subject_id = n.subject_id
     GROUP BY n.student_id`,
    [classId, sequences]
  );
  return rows.map((r) => ({ id: r.student_id, moyenne: Math.round(Number(r.moyenne) * 100) / 100 }));
};
const rangDe = (liste, id) => {
  const tri = [...liste].sort((a, b) => b.moyenne - a.moyenne);
  const i = tri.findIndex((x) => x.id === id);
  if (i < 0) return null;
  let rang = i + 1;
  while (rang > 1 && tri[rang - 2].moyenne === tri[i].moyenne) rang--;
  return { rang, sur: tri.length, moyenne: tri[i].moyenne, moyenneClasse: Math.round((tri.reduce((s, x) => s + x.moyenne, 0) / tri.length) * 100) / 100 };
};

// GET /api/suivi/eleves : resume de chaque enfant (ou de l'eleve lui-meme)
router.get("/eleves", async (req, res, next) => {
  try {
    const data = [];
    for (const { id, lien } of await elevesAccessibles(req.user)) {
      const u = (await db.query("SELECT id, first_name, last_name, school_id FROM users WHERE id = $1", [id])).rows[0];
      if (!u) continue;
      const classe = await classeActuelle(id);
      const ecole = (await db.query("SELECT name, photo FROM schools WHERE id = $1", [u.school_id])).rows[0] || {};
      // Derniere sequence avec des notes publiees
      let resultat = null;
      if (classe) {
        const seq = (
          await db.query(
            `SELECT MAX(e.sequence) AS s FROM evaluations e JOIN notes_eleves x ON x.evaluation_id = e.id
             WHERE e.class_id = $1 AND e.publiee AND x.student_id = $2 AND x.note IS NOT NULL`,
            [classe.id, id]
          )
        ).rows[0].s;
        if (seq) resultat = { sequence: seq, ...rangDe(await moyennesClasse(classe.id, [seq]), id) };
      }
      const abs = (
        await db.query(
          `SELECT COUNT(*) FILTER (WHERE status = 'absent')::int AS absences, COUNT(*) FILTER (WHERE status = 'late')::int AS retards
           FROM attendance WHERE student_id = $1 AND date >= date_trunc('month', CURRENT_DATE)`,
          [id]
        )
      ).rows[0];
      const dernieres = (
        await db.query(
          `SELECT s.name AS matiere, e.titre, e.sequence, e.bareme, x.note, x.absent, e.date_eval
           FROM notes_eleves x JOIN evaluations e ON e.id = x.evaluation_id JOIN subjects s ON s.id = e.subject_id
           WHERE x.student_id = $1 AND e.publiee ORDER BY e.created_at DESC LIMIT 3`,
          [id]
        )
      ).rows;
      data.push({
        id,
        prenom: u.first_name,
        nom: u.last_name,
        lien: lien ? LIENS[lien] || lien : null,
        ecole: ecole.name,
        classe: classe?.name || null,
        resultat,
        absencesMois: abs.absences,
        retardsMois: abs.retards,
        dernieresNotes: dernieres,
      });
    }
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// GET /api/suivi/eleves/:id/notes : notes publiees par sequence, moyenne et rang
router.get("/eleves/:id/notes", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    await verifierAcces(req.user, id);
    const classe = await classeActuelle(id);
    const { rows } = await db.query(
      `SELECT e.sequence, s.id AS matiere_id, s.name AS matiere, e.titre, e.date_eval, e.bareme, x.note, x.absent, x.appreciation,
              COALESCE(cs.coefficient, 2) AS coefficient
       FROM notes_eleves x JOIN evaluations e ON e.id = x.evaluation_id JOIN subjects s ON s.id = e.subject_id
       LEFT JOIN class_subjects cs ON cs.class_id = e.class_id AND cs.subject_id = e.subject_id
       WHERE x.student_id = $1 AND e.publiee
       ORDER BY e.sequence DESC, s.name, e.date_eval`,
      [id]
    );
    const parSequence = {};
    for (const r of rows) {
      const q = (parSequence[r.sequence] ||= { sequence: r.sequence, matieres: {} });
      const m = (q.matieres[r.matiere_id] ||= { matiere: r.matiere, coefficient: Number(r.coefficient), notes: [] });
      m.notes.push({ titre: r.titre, date: r.date_eval, note: r.note === null ? null : Number(r.note), bareme: Number(r.bareme), absent: r.absent });
    }
    const sequences = [];
    for (const q of Object.values(parSequence).sort((a, b) => b.sequence - a.sequence)) {
      const matieres = Object.values(q.matieres).map((m) => {
        const valides = m.notes.filter((n) => n.note !== null);
        const moyenne = valides.length ? Math.round((valides.reduce((s, n) => s + (n.note * 20) / n.bareme, 0) / valides.length) * 100) / 100 : null;
        return { ...m, moyenne };
      });
      const classement = classe ? rangDe(await moyennesClasse(classe.id, [q.sequence]), id) : null;
      sequences.push({ sequence: q.sequence, trimestre: Math.ceil(q.sequence / 2), matieres, ...(classement || {}) });
    }
    res.json({ success: true, data: { classe: classe?.name || null, sequences } });
  } catch (e) {
    next(e);
  }
});

// GET /api/suivi/eleves/:id/presences : absences et retards de l'annee
router.get("/eleves/:id/presences", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    await verifierAcces(req.user, id);
    const { rows } = await db.query(
      `SELECT a.date, a.status, c.name AS classe FROM attendance a JOIN classes c ON c.id = a.class_id
       WHERE a.student_id = $1 AND a.status <> 'present' ORDER BY a.date DESC LIMIT 200`,
      [id]
    );
    const total = (
      await db.query(
        `SELECT COUNT(*) FILTER (WHERE status = 'absent')::int AS absences, COUNT(*) FILTER (WHERE status = 'late')::int AS retards,
                COUNT(*) FILTER (WHERE status = 'excused')::int AS justifiees, COUNT(*)::int AS jours
         FROM attendance WHERE student_id = $1`,
        [id]
      )
    ).rows[0];
    res.json({ success: true, data: { ...total, evenements: rows } });
  } catch (e) {
    next(e);
  }
});

// GET /api/suivi/eleves/:id/devoirs : devoirs a faire de la classe
router.get("/eleves/:id/devoirs", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    await verifierAcces(req.user, id);
    const classe = await classeActuelle(id);
    if (!classe) return res.json({ success: true, data: [] });
    const { rows } = await db.query(
      `SELECT d.id, d.titre, d.consigne, d.pour_le, s.name AS matiere, u.first_name, u.last_name
       FROM devoirs d JOIN subjects s ON s.id = d.subject_id LEFT JOIN users u ON u.id = d.teacher_id
       WHERE d.class_id = $1 AND (d.pour_le IS NULL OR d.pour_le >= CURRENT_DATE - 3)
       ORDER BY d.pour_le NULLS LAST, d.created_at DESC LIMIT 60`,
      [classe.id]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
