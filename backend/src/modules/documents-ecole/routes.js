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
const { lireAvecQuota } = require("../../utils/quota-ia");
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
    // Tableau (Excel, CSV, Word) aux colonnes reconnaissables : lu directement, sans lecture automatique
    const tableau = req.body?.texte ? require("../../utils/tableur").emplois(String(req.body.texte), req.body.nom) : null;
    const doc = tableau ? null : await charger(req.body || {});
    const j = tableau || await lireAvecQuota(req, "emploi", {
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
  // Enregistrement groupe : quelques requetes pour toutes les classes envoyees (au lieu d'une par cours)
  const client = await db.connect();
  try {
    const ecole = ecoleDe(req);
    const classes = await classesDe(ecole);
    const lignes = { classe: [], jour: [], debut: [], fin: [], matiere: [], salle: [] };
    const ids = [];
    const noms = new Map(); // matiere (en minuscules) -> nom
    for (const x of (Array.isArray(req.body?.classes) ? req.body.classes : []).slice(0, 80)) {
      const c = classes.find((k) => k.id === Number(x.classId));
      if (!c) continue;
      ids.push(c.id);
      for (const k of (Array.isArray(x.creneaux) ? x.creneaux : []).slice(0, 80)) {
        const jour = Number(k.jour);
        const debut = heure(k.debut);
        const fin = heure(k.fin);
        if (!(jour >= 1 && jour <= 6) || !debut || !fin) continue;
        const m = k.matiere ? String(k.matiere).slice(0, 100).trim() : "";
        if (m) noms.set(m.toLowerCase(), m);
        lignes.classe.push(c.id);
        lignes.jour.push(jour);
        lignes.debut.push(debut);
        lignes.fin.push(fin);
        lignes.matiere.push(m.toLowerCase());
        lignes.salle.push(String(k.salle || "").slice(0, 50));
      }
    }
    // matieres : celles qui existent, puis creation des nouvelles (une seule fois chacune)
    const sid = new Map();
    if (noms.size) {
      const ex = await client.query("SELECT id, lower(name) AS n FROM subjects WHERE school_id = $1 AND lower(name) = ANY($2)", [ecole, [...noms.keys()]]);
      for (const r of ex.rows) if (!sid.has(r.n)) sid.set(r.n, r.id);
      for (const [n, nom] of noms) if (!sid.has(n)) sid.set(n, await matiereId(ecole, nom));
    }
    await client.query("BEGIN");
    if (ids.length) await client.query("DELETE FROM creneaux WHERE school_id = $1 AND class_id = ANY($2)", [ecole, ids]);
    if (lignes.classe.length)
      await client.query(
        `INSERT INTO creneaux (school_id, class_id, jour, debut, fin, subject_id, salle)
         SELECT $1, c, j, d::time, f::time, s, NULLIF(sa, '')
         FROM unnest($2::int[], $3::int[], $4::text[], $5::text[], $6::int[], $7::text[]) AS t(c, j, d, f, s, sa)`,
        [ecole, lignes.classe, lignes.jour, lignes.debut, lignes.fin, lignes.matiere.map((m) => (m ? sid.get(m) ?? null : null)), lignes.salle]
      );
    await client.query("COMMIT");
    res.json({ success: true, data: { classes: ids.length, cours: lignes.classe.length } });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    next(e);
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------- cahiers d'appel
// POST /absences/lire { url, mime } | { texte }  [ + classId ]
router.post("/absences/lire", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const classes = await classesDe(ecole);
    const unique = req.body?.classId ? classes.find((c) => c.id === Number(req.body.classId)) : null;
    const tableau = req.body?.texte ? require("../../utils/tableur").absences(String(req.body.texte), req.body.nom) : null;
    const doc = tableau ? null : await charger(req.body || {});
    const j = tableau || await lireAvecQuota(req, "absences", {
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

// ---------------------------------------------------------------- absences des enseignants (liste de l'etablissement)
// POST /enseignants-absences/lire { url, mime } | { texte } : liste des absences des enseignants (PDF, photo, Excel)
router.post("/enseignants-absences/lire", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    // Tableau (Excel, CSV, Word) aux colonnes reconnaissables : lu directement, sans lecture automatique
    const tableau = req.body?.texte ? require("../../utils/tableur").absencesEnseignants(String(req.body.texte)) : null;
    const doc = tableau ? null : await charger(req.body || {});
    const j = tableau || await lireAvecQuota(req, "absences-enseignants", {
      ...doc,
      maxTokens: 6000,
      consigne: `Ce document est une liste des absences des enseignants d'un établissement scolaire camerounais (cahier de présence des enseignants, rapport du surveillant général ou du censeur, état des absences).
Format : {"absences": [{"date": "AAAA-MM-JJ", "nom": "NOM de famille", "prenom": "Prénom(s)", "debut": "HH:MM" ou "", "fin": "HH:MM" ou "", "classe": "6e A" ou "", "motif": "" }]}.
Une ligne par enseignant absent et par date (ou par cours si les heures sont indiquées). Laisse "debut" et "fin" vides si l'absence concerne toute la journée. Ignore les enseignants présents. Si l'année n'est pas indiquée, prends l'année scolaire 2026-2027 (septembre à décembre 2026, janvier à juin 2027). N'invente rien.`,
    });
    // Enseignants de l'etablissement (comptes) et liste importee (enseignants sans compte)
    const comptes = (await db.query("SELECT id, first_name, last_name FROM users WHERE school_id = $1 AND role = 'teacher'", [ecole])).rows;
    const attendus = (await db.query("SELECT last_name, first_name FROM enseignants_attendus WHERE school_id = $1", [ecole]).catch(() => ({ rows: [] }))).rows;
    const lignes = [];
    for (const a of (Array.isArray(j.absences) ? j.absences : []).slice(0, 1000)) {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(a.date || "")) ? a.date : null;
      const k = cle(a.nom, a.prenom);
      const kNom = cle(a.nom, "");
      const t =
        comptes.find((u) => cle(u.last_name, u.first_name) === k) ||
        comptes.find((u) => k && cle(u.last_name, u.first_name).includes(k)) ||
        (kNom && comptes.filter((u) => cle(u.last_name, "") === kNom).length === 1 ? comptes.find((u) => cle(u.last_name, "") === kNom) : null);
      const sansCompte = !t && attendus.some((x) => cle(x.last_name, x.first_name) === k || (kNom && cle(x.last_name, "") === kNom));
      const debut = heure(a.debut);
      const fin = heure(a.fin);
      lignes.push({
        date,
        nom: `${a.nom || ""} ${a.prenom || ""}`.trim(),
        teacherId: t?.id || null,
        enseignant: t ? `${t.last_name} ${t.first_name}` : null,
        sansCompte,
        debut,
        fin: debut ? fin : null,
        classe: String(a.classe || "").slice(0, 50),
        motif: String(a.motif || "").trim().slice(0, 300),
        trouve: Boolean(t && date),
      });
    }
    if (!lignes.length) throw new ApiError(422, "Aucune absence d’enseignant trouvée dans ce document");
    res.json({ success: true, data: lignes });
  } catch (e) {
    next(e);
  }
});

// POST /enseignants-absences/appliquer { absences: [{ teacherId, date, debut, fin, motif }] }
// Sans heures : absence de toute la journee. Avec heures : les cours de l'enseignant dans ce creneau
// sont constates « absent » (source : liste de l'etablissement).
router.post("/enseignants-absences/appliquer", async (req, res, next) => {
  try {
    const ecole = ecoleDe(req);
    const { SQL_COURS, suivre } = require("../presence-enseignants/routes");
    let jours = 0;
    let cours = 0;
    for (const a of (Array.isArray(req.body?.absences) ? req.body.absences : []).slice(0, 1000)) {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(a.date || "")) ? a.date : null;
      const t = date && (await db.query("SELECT id FROM users WHERE id = $1 AND school_id = $2 AND role = 'teacher'", [Number(a.teacherId), ecole])).rows[0];
      if (!t) continue;
      const motif = String(a.motif || "").trim().slice(0, 300) || null;
      const debut = heure(a.debut);
      if (!debut) {
        const r = await db.query(
          `INSERT INTO absences_enseignants (school_id, teacher_id, date, motif, declare_par, source) VALUES ($1, $2, $3, $4, $5, 'liste')
           ON CONFLICT (teacher_id, date) DO UPDATE SET motif = COALESCE(EXCLUDED.motif, absences_enseignants.motif)`,
          [ecole, t.id, date, motif, req.user.id]
        );
        jours += r.rowCount;
        continue;
      }
      const fin = heure(a.fin) || "23:59";
      const liste = (await db.query(SQL_COURS("AND cs.teacher_id = $3"), [ecole, date, t.id])).rows.filter((c) => c.debut >= debut && c.debut < fin);
      for (const c of liste) {
        await suivre(ecole, c.class_id, date, c.debut, t.id, { constat: "absent", constat_par: req.user.id, constat_le: new Date(), constat_source: "liste", constat_note: motif });
        cours += 1;
      }
    }
    res.json({ success: true, data: { jours, cours } });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
