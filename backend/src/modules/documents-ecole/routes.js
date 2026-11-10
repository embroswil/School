// modules/documents-ecole/routes.js
// Documents de l'etablissement lus par l'IA, puis verifies et appliques par l'administration :
// - emplois du temps (une classe ou toute l'ecole) ;
// - cahiers d'appel (absences des eleves par date et par heure).
const express = require("express");
const router = express.Router();
const db = require("../../config/db");
const ApiError = require("../../utils/ApiError");
const { authenticate, authorize } = require("../../middlewares/auth.middleware");
const { assurerAnneeScolaire } = require("../../utils/annees");
const { lireDocument } = require("../../utils/ia");
const { cle, matiereId, sansAccent } = require("../../utils/enseignants-attendus");

router.use(authenticate, authorize("admin"));
const ecoleDe = (req) => {
  if (!req.user.schoolId) throw new ApiError(400, "Aucun établissement associé à votre compte");
  return req.user.schoolId;
};

// Recupere le document (PDF, photo) depuis le stockage, ou prend le texte d'un tableur lu dans le navigateur
const charger = async (b) => {
  if (b.texte) return { images: [], pdfs: [], texte: String(b.texte).slice(0, 60000) };
  const { prefixePublic } = require("../medias/routes");
  const url = String(b.url || "");
  if (!url.startsWith(prefixePublic())) throw new ApiError(400, "Document invalide");
  const r = await fetch(url);
  const buf = Buffer.from(await r.arrayBuffer());
  if (!r.ok || buf.length > 15 * 1024 * 1024) throw new ApiError(400, "Document trop lourd ou introuvable");
  const mime = String(b.mime || "");
  const b64 = buf.toString("base64");
  if (mime.startsWith("image/")) return { images: [`data:${mime === "image/png" ? "image/png" : mime === "image/webp" ? "image/webp" : "image/jpeg"};base64,${b64}`], pdfs: [], texte: "" };
  if (mime === "application/pdf") return { images: [], pdfs: [b64], texte: "" };
  throw new ApiError(400, "Format non lisible : utilisez un PDF, une photo, un fichier Excel ou CSV");
};

const JOURS = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const heure = (t) => {
  const m = String(t || "").match(/(\d{1,2})\s*[h:H]\s*(\d{2})?/);
  if (!m) return null;
  const h = Number(m[1]);
  const mn = Number(m[2] || 0);
  return h < 24 && mn < 60 ? `${String(h).padStart(2, "0")}:${String(mn).padStart(2, "0")}` : null;
};
const classesDe = async (ecole) => {
  const annee = await assurerAnneeScolaire(ecole);
  return (await db.query("SELECT id, name FROM classes WHERE academic_year_id = $1", [annee.id])).rows;
};
const trouverClasse = (liste, nom) => {
  const k = sansAccent(nom).toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!k) return null;
  return liste.find((c) => sansAccent(c.name).toLowerCase().replace(/[^a-z0-9]+/g, "") === k) || null;
};

// ---------------------------------------------------------------- emplois du temps
// POST /emplois/lire { url, mime } | { texte }  [ + classId : le document ne concerne que cette classe ]
router.post("/emplois/lire", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const classes = await classesDe(ecole);
    const unique = req.body?.classId ? classes.find((c) => c.id === Number(req.body.classId)) : null;
    const doc = await charger(req.body || {});
    const j = await lireDocument({
      ...doc,
      maxTokens: 8000,
      consigne: `Ce document est l'emploi du temps ${unique ? `de la classe « ${unique.name} »` : "d'une ou plusieurs classes"} d'un établissement scolaire camerounais.
Pour chaque classe, extrais tous les cours de la semaine. Format : {"classes": [{"classe": "6e A", "creneaux": [{"jour": "lundi", "debut": "07:30", "fin": "08:25", "matiere": "Mathématiques", "salle": "12" ou ""}]}]}.
Jours : lundi à samedi. Heures au format HH:MM (24 h). Si le document ne concerne qu'une classe, mets son nom (ou "" si absent). Ignore les récréations, pauses et cases vides. N'invente rien.`,
    });
    const brut = Array.isArray(j.classes) ? j.classes : [];
    const data = brut.map((x) => {
      const classe = unique || trouverClasse(classes, x.classe) || (brut.length === 1 ? null : null);
      const creneaux = (Array.isArray(x.creneaux) ? x.creneaux : [])
        .map((c) => ({ jour: JOURS[sansAccent(c.jour).toLowerCase().trim()] || 0, debut: heure(c.debut), fin: heure(c.fin), matiere: String(c.matiere || "").trim().slice(0, 100), salle: String(c.salle || "").trim().slice(0, 50) }))
        .filter((c) => c.jour && c.debut && c.fin && c.matiere);
      return { nomLu: String(x.classe || ""), classId: classe?.id || null, classe: classe?.name || null, creneaux };
    }).filter((x) => x.creneaux.length);
    if (!data.length) throw new ApiError(422, "Aucun cours trouvé dans ce document");
    res.json({ success: true, data: { classes: data, classesEcole: classes.map((c) => ({ id: c.id, name: c.name })) } });
  } catch (e) {
    next(e);
  }
});

// POST /emplois/appliquer { classes: [{ classId, creneaux: [...] }] } : remplace l'emploi du temps de chaque classe
router.post("/emplois/appliquer", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const classes = await classesDe(ecole);
    let nbClasses = 0;
    let nbCours = 0;
    for (const x of (Array.isArray(req.body?.classes) ? req.body.classes : []).slice(0, 80)) {
      const c = classes.find((k) => k.id === Number(x.classId));
      if (!c) continue;
      const liste = (Array.isArray(x.creneaux) ? x.creneaux : []).slice(0, 80);
      await db.query("DELETE FROM creneaux WHERE class_id = $1", [c.id]);
      for (const k of liste) {
        const jour = Number(k.jour);
        const debut = heure(k.debut);
        const fin = heure(k.fin);
        if (!(jour >= 1 && jour <= 6) || !debut || !fin) continue;
        const sid = k.matiere ? await matiereId(ecole, String(k.matiere).slice(0, 100)) : null;
        await db.query("INSERT INTO creneaux (school_id, class_id, jour, debut, fin, subject_id, salle) VALUES ($1, $2, $3, $4, $5, $6, $7)", [ecole, c.id, jour, debut, fin, sid, String(k.salle || "").slice(0, 50) || null]);
        nbCours += 1;
      }
      nbClasses += 1;
    }
    res.json({ success: true, data: { classes: nbClasses, cours: nbCours } });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------- cahiers d'appel
// POST /absences/lire { url, mime } | { texte }  [ + classId ]
router.post("/absences/lire", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const classes = await classesDe(ecole);
    const unique = req.body?.classId ? classes.find((c) => c.id === Number(req.body.classId)) : null;
    const doc = await charger(req.body || {});
    const j = await lireDocument({
      ...doc,
      maxTokens: 8000,
      consigne: `Ce document est un cahier d'appel (ou un relevé d'absences) d'un établissement scolaire camerounais${unique ? `, pour la classe « ${unique.name} »` : ""}. Il liste les élèves absents, par jour et parfois par heure de cours.
Format : {"classe": "6e A" ou "", "absences": [{"date": "AAAA-MM-JJ", "heure": "HH:MM" ou "" (heure du cours si indiquée), "nom": "NOM de famille", "prenom": "Prénom(s)", "classe": "6e A" (si le document couvre plusieurs classes)}]}.
Une ligne par élève absent et par date. Ignore les élèves présents. Si l'année n'est pas indiquée, prends l'année scolaire 2026-2027 (septembre à décembre 2026, janvier à juin 2027). N'invente rien.`,
    });
    const defaut = unique || trouverClasse(classes, j.classe);
    const eleves = new Map(); // classId -> eleves
    const elevesDe = async (id) => {
      if (!eleves.has(id)) {
        eleves.set(id, (await db.query("SELECT u.id, u.first_name, u.last_name FROM class_students cs JOIN users u ON u.id = cs.student_id WHERE cs.class_id = $1 AND cs.status = 'active'", [id])).rows);
      }
      return eleves.get(id);
    };
    const lignes = [];
    for (const a of (Array.isArray(j.absences) ? j.absences : []).slice(0, 3000)) {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(a.date || "")) ? a.date : null;
      const classe = unique || trouverClasse(classes, a.classe) || defaut;
      let eleve = null;
      if (classe) {
        const k = cle(a.nom, a.prenom);
        const ls = await elevesDe(classe.id);
        eleve = ls.find((e) => cle(e.last_name, e.first_name) === k) || ls.find((e) => k && cle(e.last_name, e.first_name).includes(k)) || null;
      }
      lignes.push({ date, heure: heure(a.heure), nom: `${a.nom || ""} ${a.prenom || ""}`.trim(), classId: classe?.id || null, classe: classe?.name || String(a.classe || ""), studentId: eleve?.id || null, trouve: Boolean(eleve && date) });
    }
    if (!lignes.length) throw new ApiError(422, "Aucune absence trouvée dans ce document");
    res.json({ success: true, data: lignes });
  } catch (e) {
    next(e);
  }
});

// POST /absences/appliquer { absences: [{ studentId, classId, date, heure }] }
// Les absences deja saisies par un enseignant ne sont pas modifiees ; l'appel est marque « fait » pour ce jour
router.post("/absences/appliquer", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const classes = await classesDe(ecole);
    const annee = await assurerAnneeScolaire(ecole);
    let ajoutees = 0;
    let dejaLa = 0;
    for (const a of (Array.isArray(req.body?.absences) ? req.body.absences : []).slice(0, 3000)) {
      const c = classes.find((k) => k.id === Number(a.classId));
      if (!c || !/^\d{4}-\d{2}-\d{2}$/.test(String(a.date || ""))) continue;
      const h = heure(a.heure);
      const periode = h ? Number(h.replace(":", "")) : null;
      await db.query(
        `INSERT INTO appels (class_id, date, period_number, marked_by) VALUES ($1, $2, $3, $4)
         ON CONFLICT (class_id, date, COALESCE(period_number, -1)) DO NOTHING`,
        [c.id, a.date, periode, req.user.id]
      );
      const conflit = periode === null ? "(student_id, class_id, date) WHERE period_number IS NULL" : "(student_id, class_id, date, period_number) WHERE period_number IS NOT NULL";
      const r = await db.query(
        `INSERT INTO attendance (student_id, class_id, academic_year_id, date, period_number, status, marked_by)
         SELECT $1, $2, $3, $4, $5::int, 'absent', $6 WHERE EXISTS (SELECT 1 FROM class_students WHERE class_id = $2 AND student_id = $1 AND status = 'active')
         ON CONFLICT ${conflit} DO NOTHING`,
        [Number(a.studentId), c.id, annee.id, a.date, periode, req.user.id]
      );
      if (r.rowCount) ajoutees += 1;
      else dejaLa += 1;
    }
    res.json({ success: true, data: { ajoutees, dejaLa } });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
