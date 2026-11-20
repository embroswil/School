// modules/presence-enseignants/routes.js
// Presence des enseignants. Un cours n'est jamais compte « absent » parce que l'appel manque :
// chaque cours de l'emploi du temps recoit des signaux, et sans aucun signal il est « a verifier ».
//  - l'enseignant confirme « je suis en cours » (un geste) et remplit le cahier de textes ;
//  - l'appel fait vaut aussi confirmation ;
//  - la direction (surveillant general, censeur) constate present ou absent lors de sa ronde,
//    ou importe la liste des absences des enseignants (PDF, photo) ;
//  - l'enseignant signale son absence a l'avance.
const express = require("express");
const { membreSql } = require("../../utils/membres");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate } = require("../../middlewares/auth.middleware");
const { notifierEtablissement } = require("../../utils/notifier");

router.use(authenticate);
const entier = (v) => parseInt(v, 10);
// Date et heure au Cameroun (UTC+1, sans heure d'ete)
const camerounNow = () => new Date(Date.now() + 3600 * 1000).toISOString();
const jourCameroun = () => camerounNow().slice(0, 10);
const heureCameroun = () => camerounNow().slice(11, 16);
const dateOk = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || "") ? d : null);
const heureOk = (h) => (/^\d{2}:\d{2}$/.test(h || "") ? h : null);
const reserveAdmin = (req) => {
  if (req.user.role !== "principal") throw new ApiError(403, "Réservé à l’administration de l’établissement");
};
const decaler = (hhmm, minutes) => {
  const [h, m] = hhmm.split(":").map(Number);
  const t = h * 60 + m + minutes;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

// Cours d'un jour (emploi du temps), avec l'appel et le suivi. filtre : condition SQL supplementaire ($3…)
const SQL_COURS = (filtre = "") => `
  SELECT c.id AS class_id, c.name AS classe, to_char(cr.debut, 'HH24:MI') AS debut, to_char(cr.fin, 'HH24:MI') AS fin, cr.salle,
         s.name AS matiere, u.id AS teacher_id, u.first_name, u.last_name, u.phone,
         EXISTS (SELECT 1 FROM appels ap WHERE ap.class_id = cr.class_id AND ap.date = $2::date
                 AND (ap.period_number = to_char(cr.debut, 'HH24MI')::int OR ap.period_number IS NULL)) AS appel,
         su.confirme_le, su.contenu, su.contenu_le, su.constat, su.constat_source, su.constat_note, su.constat_le
  FROM creneaux cr JOIN classes c ON c.id = cr.class_id
  JOIN academic_years ay ON ay.id = c.academic_year_id AND ay.is_current
  LEFT JOIN subjects s ON s.id = cr.subject_id
  LEFT JOIN class_subjects cs ON cs.class_id = cr.class_id AND cs.subject_id = cr.subject_id
  LEFT JOIN users u ON u.id = cs.teacher_id
  LEFT JOIN cours_suivi su ON su.class_id = cr.class_id AND su.date = $2::date AND su.debut = cr.debut
  WHERE cr.school_id = $1 AND cr.jour = EXTRACT(ISODOW FROM $2::date) ${filtre}
  ORDER BY cr.debut, c.name`;

// Etat d'un cours : absent, absent_prevu, assure, en_cours, a_venir, a_verifier ; avec ses signaux
const etatCours = (c, date, absence) => {
  const signaux = [
    c.confirme_le && "confirme",
    c.contenu && "cahier",
    c.appel && "appel",
    c.constat === "present" && (c.constat_source === "liste" ? "liste" : "ronde"),
  ].filter(Boolean);
  let etat;
  if (absence) etat = absence.par_lui ? "absent_prevu" : "absent";
  else if (c.constat === "absent") etat = "absent";
  else if (signaux.length) etat = "assure";
  else {
    const auj = jourCameroun();
    const h = heureCameroun();
    if (date > auj || (date === auj && h < c.debut)) etat = "a_venir";
    else if (date === auj && h < c.fin) etat = "en_cours";
    else etat = "a_verifier";
  }
  return { ...c, etat, signaux, absent: Boolean(absence) || c.constat === "absent" };
};

const absencesDuJour = async (ecole, date) =>
  (
    await db.query(
      `SELECT a.id, a.teacher_id, a.motif, a.source, u.first_name, u.last_name, (a.declare_par = a.teacher_id) AS par_lui
       FROM absences_enseignants a JOIN users u ON u.id = a.teacher_id WHERE a.school_id = $1 AND a.date = $2`,
      [ecole, date]
    )
  ).rows;

// Enregistre un signal sur un cours (cree la ligne de suivi au besoin)
const suivre = (ecole, classId, date, debut, teacherId, champs) => {
  const cles = Object.keys(champs);
  return db.query(
    `INSERT INTO cours_suivi (school_id, class_id, date, debut, teacher_id, ${cles.join(", ")})
     VALUES ($1, $2, $3, $4, $5, ${cles.map((_, i) => `$${i + 6}`).join(", ")})
     ON CONFLICT (class_id, date, debut) DO UPDATE SET teacher_id = COALESCE(EXCLUDED.teacher_id, cours_suivi.teacher_id),
       ${cles.map((k) => `${k} = EXCLUDED.${k}`).join(", ")}
     RETURNING *`,
    [ecole, classId, date, debut, teacherId, ...cles.map((k) => champs[k])]
  );
};

// ---------------------------------------------------------------- direction

// GET /api/presence-enseignants?date= : cours du jour et leur etat, absences, bilan sur 30 jours
router.get("/", async (req, res, next) => {
  try {
    reserveAdmin(req);
    const ecole = req.user.schoolId;
    const date = dateOk(req.query.date) || jourCameroun();
    const absences = await absencesDuJour(ecole, date);
    const cours = (await db.query(SQL_COURS(), [ecole, date])).rows.map((c) =>
      etatCours(c, date, absences.find((a) => a.teacher_id === c.teacher_id))
    );
    // Sur les 30 derniers jours, par enseignant (cours deja termines) : confirmes, absences, a verifier
    const bilan = (
      await db.query(
        `WITH jours AS (SELECT d::date AS d FROM generate_series($2::date - 29, $2::date, '1 day') d),
              prevus AS (
                SELECT j.d, cr.class_id, cr.debut, cs.teacher_id
                FROM jours j JOIN creneaux cr ON cr.jour = EXTRACT(ISODOW FROM j.d) AND cr.school_id = $1
                JOIN classes c ON c.id = cr.class_id JOIN academic_years ay ON ay.id = c.academic_year_id AND ay.is_current
                JOIN class_subjects cs ON cs.class_id = cr.class_id AND cs.subject_id = cr.subject_id
                WHERE cs.teacher_id IS NOT NULL AND (j.d < $3::date OR (j.d = $3::date AND cr.fin < $4::time)))
         SELECT p.teacher_id, u.first_name, u.last_name, COUNT(*)::int AS prevus,
                COUNT(*) FILTER (WHERE ab.id IS NOT NULL OR su.constat = 'absent')::int AS absences,
                COUNT(*) FILTER (WHERE ab.id IS NULL AND su.constat IS DISTINCT FROM 'absent' AND (
                  su.confirme_le IS NOT NULL OR su.contenu IS NOT NULL OR su.constat = 'present'
                  OR EXISTS (SELECT 1 FROM appels ap WHERE ap.class_id = p.class_id AND ap.date = p.d
                             AND (ap.period_number = to_char(p.debut, 'HH24MI')::int OR ap.period_number IS NULL))))::int AS confirmes
         FROM prevus p JOIN users u ON u.id = p.teacher_id
         LEFT JOIN cours_suivi su ON su.class_id = p.class_id AND su.date = p.d AND su.debut = p.debut
         LEFT JOIN absences_enseignants ab ON ab.teacher_id = p.teacher_id AND ab.date = p.d
         GROUP BY p.teacher_id, u.first_name, u.last_name`,
        [ecole, date, jourCameroun(), heureCameroun()]
      )
    ).rows
      .map((b) => ({ ...b, a_verifier: Math.max(0, b.prevus - b.confirmes - b.absences) }))
      .sort((a, b) => b.a_verifier - a.a_verifier || b.absences - a.absences || a.last_name.localeCompare(b.last_name, "fr"));
    res.json({ success: true, data: { date, maintenant: date === jourCameroun() ? heureCameroun() : null, cours, absences, bilan } });
  } catch (e) {
    next(e);
  }
});

// GET /api/presence-enseignants/reglages : delai du rappel de presence (minutes apres le debut du cours ; null = aucun rappel)
router.get("/reglages", async (req, res, next) => {
  try {
    reserveAdmin(req);
    const r = (await db.query("SELECT rappel_presence_minutes FROM schools WHERE id = $1", [req.user.schoolId])).rows[0];
    res.json({ success: true, data: { rappelMinutes: r ? r.rappel_presence_minutes : 15 } });
  } catch (e) {
    next(e);
  }
});

// PUT /api/presence-enseignants/reglages { rappelMinutes }
router.put("/reglages", async (req, res, next) => {
  try {
    reserveAdmin(req);
    const v = req.body?.rappelMinutes;
    const minutes = v === null ? null : Number.isInteger(v) && v >= 0 && v <= 90 ? v : undefined;
    if (minutes === undefined) throw new ApiError(400, "Délai invalide (0 à 90 minutes)");
    await db.query("UPDATE schools SET rappel_presence_minutes = $2 WHERE id = $1", [req.user.schoolId, minutes]);
    res.json({ success: true, data: { rappelMinutes: minutes } });
  } catch (e) {
    next(e);
  }
});

// POST /api/presence-enseignants/constat { classId, debut, date, etat: 'present' | 'absent' | '', note }
// Constat de la direction (ronde du surveillant general ou du censeur) ; etat vide : annule le constat
router.post("/constat", async (req, res, next) => {
  try {
    reserveAdmin(req);
    const ecole = req.user.schoolId;
    const b = req.body || {};
    const date = dateOk(b.date);
    const debut = heureOk(b.debut);
    if (!date || !debut) throw new ApiError(400, "Cours invalide");
    if (date > jourCameroun()) throw new ApiError(400, "Ce cours n’a pas encore eu lieu");
    const cr = (await db.query(SQL_COURS("AND cr.class_id = $3 AND cr.debut = $4::time"), [ecole, date, entier(b.classId), debut])).rows[0];
    if (!cr) throw new ApiError(404, "Cours introuvable dans l’emploi du temps");
    const etat = ["present", "absent"].includes(b.etat) ? b.etat : null;
    await suivre(ecole, cr.class_id, date, debut, cr.teacher_id, {
      constat: etat,
      constat_par: etat ? req.user.id : null,
      constat_le: etat ? new Date() : null,
      constat_source: etat ? "ronde" : null,
      constat_note: etat ? String(b.note || "").trim().slice(0, 300) || null : null,
    });
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// POST /api/presence-enseignants { date, motif, teacherId? } : l'enseignant signale son absence,
// ou l'administration marque un enseignant absent toute la journee
router.post("/", async (req, res, next) => {
  try {
    if (!["principal", "teacher"].includes(req.user.role)) throw new ApiError(403, "Accès réservé");
    const date = dateOk(req.body?.date);
    if (!date) throw new ApiError(400, "Date invalide");
    const teacherId = req.user.role === "teacher" ? req.user.id : entier(req.body?.teacherId);
    const t = (await db.query(`SELECT u.id, u.first_name, u.last_name FROM users u WHERE u.id = $1 AND u.role = 'teacher' AND ${membreSql("u.", "$2")}`, [teacherId, req.user.schoolId])).rows[0];
    if (!t) throw new ApiError(404, "Enseignant introuvable");
    const motif = String(req.body?.motif || "").trim().slice(0, 300) || null;
    await db.query(
      `INSERT INTO absences_enseignants (school_id, teacher_id, date, motif, declare_par, source) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (teacher_id, date) DO UPDATE SET motif = COALESCE(EXCLUDED.motif, absences_enseignants.motif)`,
      [req.user.schoolId, teacherId, date, motif, req.user.id, req.user.role === "teacher" ? "enseignant" : "direction"]
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

// ---------------------------------------------------------------- enseignant

// GET /api/presence-enseignants/mes-cours?date= : les cours de l'enseignant ce jour-la, et leur suivi
router.get("/mes-cours", async (req, res, next) => {
  try {
    if (req.user.role !== "teacher") throw new ApiError(403, "Réservé aux enseignants");
    const ecole = req.user.schoolId;
    const date = dateOk(req.query.date) || jourCameroun();
    const absence = (await db.query("SELECT id, motif, (declare_par = teacher_id) AS par_lui FROM absences_enseignants WHERE teacher_id = $1 AND date = $2", [req.user.id, date])).rows[0];
    const cours = (await db.query(SQL_COURS("AND cs.teacher_id = $3"), [ecole, date, req.user.id])).rows.map((c) => etatCours(c, date, absence));
    const total = (
      await db.query("SELECT COUNT(*)::int AS n FROM creneaux cr JOIN class_subjects cs ON cs.class_id = cr.class_id AND cs.subject_id = cr.subject_id WHERE cs.teacher_id = $1", [req.user.id])
    ).rows[0].n;
    res.json({ success: true, data: { date, aujourdhui: jourCameroun(), maintenant: heureCameroun(), cours, absence: absence || null, total } });
  } catch (e) {
    next(e);
  }
});

// Cours de l'enseignant (verifie dans l'emploi du temps)
const monCours = async (req) => {
  if (req.user.role !== "teacher") throw new ApiError(403, "Réservé aux enseignants");
  const b = req.body || {};
  const date = dateOk(b.date);
  const debut = heureOk(b.debut);
  if (!date || !debut) throw new ApiError(400, "Cours invalide");
  const cr = (
    await db.query(SQL_COURS("AND cs.teacher_id = $3 AND cr.class_id = $4 AND cr.debut = $5::time"), [req.user.schoolId, date, req.user.id, entier(b.classId), debut])
  ).rows[0];
  if (!cr) throw new ApiError(404, "Ce cours n’est pas dans votre emploi du temps");
  return { cr, date, debut };
};

// POST /api/presence-enseignants/mes-cours/confirmer { classId, debut, date } : « je suis en cours »
// Possible le jour meme, de 15 minutes avant le debut du cours jusqu'a sa fin
router.post("/mes-cours/confirmer", async (req, res, next) => {
  try {
    const { cr, date, debut } = await monCours(req);
    if (date !== jourCameroun()) throw new ApiError(400, "La présence se confirme le jour du cours");
    if (heureCameroun() < decaler(debut, -15)) throw new ApiError(400, `Vous pourrez confirmer à partir de ${decaler(debut, -15)}`);
    if (cr.fin && heureCameroun() >= cr.fin) throw new ApiError(400, "Ce cours est terminé : la présence ne peut plus être confirmée.");
    const r = await suivre(req.user.schoolId, cr.class_id, date, debut, req.user.id, { confirme_le: new Date() });
    res.json({ success: true, data: { confirme_le: r.rows[0].confirme_le } });
  } catch (e) {
    next(e);
  }
});

// PUT /api/presence-enseignants/mes-cours/cahier { classId, debut, date, contenu } : cahier de textes
// (ce qui a ete fait pendant le cours), le jour meme ou dans les 14 jours qui suivent
router.put("/mes-cours/cahier", async (req, res, next) => {
  try {
    const { cr, date, debut } = await monCours(req);
    const auj = jourCameroun();
    const limite = new Date(`${auj}T12:00:00Z`);
    limite.setUTCDate(limite.getUTCDate() - 14);
    if (date > auj || (date === auj && heureCameroun() < decaler(debut, -15))) throw new ApiError(400, "Le cahier de textes se remplit à partir du début du cours");
    if (date < limite.toISOString().slice(0, 10)) throw new ApiError(400, "Ce cours date de plus de 14 jours");
    const contenu = String(req.body?.contenu || "").trim().slice(0, 2000) || null;
    await suivre(req.user.schoolId, cr.class_id, date, debut, req.user.id, { contenu, contenu_le: contenu ? new Date() : null });
    res.json({ success: true });
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
module.exports.SQL_COURS = SQL_COURS;
module.exports.suivre = suivre;
